#!/usr/bin/env node
// Local progress dashboard server. Zero dependencies.
//
//   node scripts/progress/server.mjs        -> http://127.0.0.1:4400/
//
//   GET /              index.html
//   GET /api/state     JSON from readState()
//   GET /api/stream    Server-Sent Events: `update` whenever events.jsonl changes
//   GET /report/<p>    files under <main root>/.verify/report/
//   GET /notes/<p>     files under <main root>/docs/astro-notes/ (as text/plain)
//
// Env: PROGRESS_PORT (default 4400), PROGRESS_DIR (see emit.mjs),
//      PROGRESS_REPORT_DIR / PROGRESS_NOTES_DIR (override the two static roots; used by tests).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eventsFile, mainRoot } from "./emit.mjs";
import { PLAN_FILE, readState } from "./state.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = parsePort(process.env.PROGRESS_PORT, 4400);
const INDEX_FILE = path.join(HERE, "index.html");
const REPORT_DIR = path.resolve(
  process.env.PROGRESS_REPORT_DIR || path.join(mainRoot(), ".verify", "report"),
);
const NOTES_DIR = path.resolve(
  process.env.PROGRESS_NOTES_DIR ||
    path.join(mainRoot(), "docs", "astro-notes"),
);
const NOTES_PREFIX = "docs/astro-notes/";

const POLL_MS = 500;
const HEARTBEAT_MS = 15_000;

const TEXT = "text/plain; charset=utf-8";
const CONTENT_TYPES = {
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".txt": TEXT,
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".log": TEXT,
  ".md": TEXT,
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8",
};

function parsePort(value, fallback) {
  const port = Number.parseInt(value ?? "", 10);
  return Number.isInteger(port) && port >= 0 && port < 65536 ? port : fallback;
}

// ------------------------------------------------------------------------------ helpers

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Content-Type": TEXT,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(res.req.method === "HEAD" ? undefined : body);
}

const isInside = (base, target) =>
  target === base || target.startsWith(base + path.sep);

/**
 * Map an undecoded URL remainder to a regular file strictly inside `base`.
 * Returns { file } or { status } (400 malformed, 403 outside the root, 404 missing).
 */
function resolveInside(base, rawRelative, strip = (p) => p) {
  let relative;
  try {
    relative = decodeURIComponent(rawRelative);
  } catch {
    return { status: 400 };
  }
  if (relative.includes("\0")) return { status: 400 };
  const target = path.join(base, strip(relative)); // join normalises `..`, so the check below sees the real target
  if (!isInside(base, target)) return { status: 403 };
  try {
    // Resolve symlinks too: a link inside the root must not lead outside it.
    const realBase = fs.realpathSync(base);
    const real = fs.realpathSync(target);
    if (!isInside(realBase, real)) return { status: 403 };
    if (!fs.statSync(real).isFile()) return { status: 404 };
    return { file: real };
  } catch {
    return { status: 404 };
  }
}

function serveFile(res, resolved, contentType) {
  if (!resolved.file) {
    const message = { 400: "bad request", 403: "forbidden", 404: "not found" }[
      resolved.status
    ];
    return send(res, resolved.status, message + "\n");
  }
  fs.readFile(resolved.file, (err, data) => {
    if (err) return send(res, 404, "not found\n");
    send(res, 200, data, { "Content-Type": contentType });
  });
}

/** Accept `/notes/01-x.md` as well as `/notes/docs/astro-notes/01-x.md`. */
function stripNotesPrefix(relative) {
  const at = relative.lastIndexOf(NOTES_PREFIX);
  return at >= 0 ? relative.slice(at + NOTES_PREFIX.length) : relative;
}

// ---------------------------------------------------------------------------------- SSE

const clients = new Set();

function broadcast(chunk) {
  for (const res of clients) res.write(chunk);
}

function openStream(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write("retry: 2000\n: connected\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
}

/** size:mtime of the files the state is built from; fs.watch alone is unreliable, so poll. */
function signature() {
  return [eventsFile(), PLAN_FILE]
    .map((file) => {
      try {
        const stat = fs.statSync(file);
        return `${stat.size}:${stat.mtimeMs}`;
      } catch {
        return "missing";
      }
    })
    .join("|");
}

let lastSignature = signature();
const pollTimer = setInterval(() => {
  const current = signature();
  if (current === lastSignature) return;
  lastSignature = current;
  broadcast(
    `event: update\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
  );
}, POLL_MS);
const heartbeatTimer = setInterval(
  () => broadcast(": heartbeat\n\n"),
  HEARTBEAT_MS,
);

// ------------------------------------------------------------------------------- routes

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "method not allowed\n", { Allow: "GET, HEAD" });
  }
  // Loopback only: refuse other Host headers so a DNS-rebinding page cannot read local files.
  const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
    return send(res, 403, "forbidden\n");

  // Route on the raw path (no URL normalisation) so `..` segments reach resolveInside and get refused.
  const rawPath = String(req.url ?? "").split(/[?#]/, 1)[0];

  if (rawPath === "/" || rawPath === "/index.html") {
    return fs.readFile(INDEX_FILE, (err, data) => {
      if (err) return send(res, 500, "index.html is missing\n");
      send(res, 200, data, { "Content-Type": "text/html; charset=utf-8" });
    });
  }
  if (rawPath === "/api/state") {
    try {
      return send(res, 200, JSON.stringify(readState()), {
        "Content-Type": "application/json; charset=utf-8",
      });
    } catch (err) {
      return send(
        res,
        500,
        JSON.stringify({ error: String(err?.message ?? err) }),
        {
          "Content-Type": "application/json; charset=utf-8",
        },
      );
    }
  }
  if (rawPath === "/api/stream") {
    if (req.method === "HEAD")
      return send(res, 200, "", {
        "Content-Type": "text/event-stream; charset=utf-8",
      });
    return openStream(req, res);
  }
  if (rawPath.startsWith("/report/")) {
    const resolved = resolveInside(
      REPORT_DIR,
      rawPath.slice("/report/".length),
    );
    const type = resolved.file
      ? CONTENT_TYPES[path.extname(resolved.file).toLowerCase()]
      : undefined;
    return serveFile(res, resolved, type ?? "application/octet-stream");
  }
  if (rawPath.startsWith("/notes/")) {
    return serveFile(
      res,
      resolveInside(
        NOTES_DIR,
        rawPath.slice("/notes/".length),
        stripNotesPrefix,
      ),
      TEXT,
    );
  }
  if (rawPath === "/favicon.ico") return send(res, 204, "");
  return send(res, 404, "not found\n");
});

server.on("error", (err) => {
  const reason =
    err.code === "EADDRINUSE"
      ? `port ${PORT} is already in use (set PROGRESS_PORT)`
      : err.message;
  process.stderr.write(`[progress] server failed: ${reason}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `progress dashboard: http://${HOST}:${server.address().port}/\n`,
  );
});

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);
  for (const res of clients) res.end();
  server.close(() => process.exit(0));
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 1000).unref(); // do not hang on a stuck socket
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
