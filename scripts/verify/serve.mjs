// Static server that mimics GitHub Pages path resolution. Zero dependencies.
//
//   import { startServer } from "./serve.mjs";
//   const { url, close } = await startServer(dir);          // ephemeral port
//
//   node scripts/verify/serve.mjs <dir> [port]               // CLI
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolve } from "./lib/resolve.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

export function startServer(root, { port = 0 } = {}) {
  root = path.resolve(root);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const hit = resolve(root, url.pathname);

    if (hit.status === 301) {
      res.writeHead(301, { location: hit.location + url.search });
      res.end();
      return;
    }

    if (!hit.file) {
      res.writeHead(hit.status, {
        "content-type": "text/plain; charset=utf-8",
      });
      res.end(String(hit.status));
      return;
    }

    res.writeHead(hit.status, {
      "content-type":
        TYPES[path.extname(hit.file).toLowerCase()] ??
        "application/octet-stream",
      "cache-control": "no-store",
    });
    fs.createReadStream(hit.file).pipe(res);
  });

  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      const { port: actual } = server.address();
      ok({
        url: `http://127.0.0.1:${actual}`,
        port: actual,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, port] = process.argv.slice(2);
  if (!dir) {
    console.error("usage: node scripts/verify/serve.mjs <dir> [port]");
    process.exit(2);
  }
  const { url } = await startServer(dir, { port: Number(port ?? 0) });
  console.log(url);
}
