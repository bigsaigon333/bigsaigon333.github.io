// Shared engine for run.mjs, selftest.mjs and live.mjs.
// The check-module contract is documented in scripts/verify/README.md.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { load } from "cheerio";

import { startServer } from "../serve.mjs";
import { allowlistFile, baselineDir, cacheDir, checksDir, distDir, reportDir } from "./paths.mjs";
import { listRoutes, resolve } from "./resolve.mjs";

export function parseArgs(argv) {
  const args = { only: [], route: [], static: false, noBuild: false, noCheck: false };
  for (const raw of argv) {
    const [key, ...rest] = raw.replace(/^--/, "").split("=");
    const value = rest.join("=");
    if (key === "only" || key === "route") args[key] = value.split(",").filter(Boolean);
    else if (key === "static") args.static = true;
    else if (key === "no-build") args.noBuild = true;
    else if (key === "no-check") args.noCheck = true;
    else args[key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value === "" ? true : value;
  }
  return args;
}

function loadAllowlist() {
  let entries = [];
  try {
    entries = JSON.parse(fs.readFileSync(allowlistFile, "utf8")).entries ?? [];
  } catch {
    // no allowlist yet
  }
  return entries;
}

/**
 * @param {object} options
 * @param {string} [options.candidateDir]  built site to verify (default: dist/)
 * @param {string} [options.candidateUrl]  verify a deployed site instead of a directory
 * @param {string} [options.baseline]      reference site (default: .verify/baseline)
 * @param {object} [options.args]          parsed CLI args
 */
export function createContext({ candidateDir = distDir, candidateUrl = null, baseline = baselineDir, args = {} } = {}) {
  const allRoutes = listRoutes(baseline);
  const wanted = args.route ?? [];
  const allowlist = loadAllowlist();
  const dirs = { baseline, candidate: candidateDir };
  const htmlCache = new Map();
  const servers = new Map();

  const ctx = {
    args,
    baselineDir: baseline,
    candidateDir,
    candidateUrl,
    reportDir,
    cacheDir,
    /** Every HTML route of the baseline: "/", "/404", "/posts/<id>". */
    allRoutes,
    /** allRoutes narrowed by --route. Checks iterate over this. */
    routes: wanted.length ? allRoutes.filter((route) => wanted.includes(route)) : allRoutes,

    /** Reason string if `item` is an accepted difference for `check`, else null. */
    allowed(check, item) {
      const hit = allowlist.find(
        (entry) =>
          entry.check === check &&
          (entry.item === item || (entry.item.endsWith("**") && item.startsWith(entry.item.slice(0, -2)))),
      );
      return hit ? hit.reason : null;
    },

    /** Absolute path of the file a route resolves to on `side` ("baseline" | "candidate"), or null. */
    fileFor(side, route) {
      const hit = resolve(dirs[side], route);
      return hit.file && (hit.status === 200 || route === "/404") ? hit.file : null;
    },

    /** HTML source of a route, or null when the route does not exist on that side. */
    async html(side, route) {
      const key = `${side}|${route}`;
      if (htmlCache.has(key)) return htmlCache.get(key);

      let html = null;
      if (side === "candidate" && candidateUrl) {
        const response = await fetch(candidateUrl + route, { redirect: "manual" });
        if (response.status === 200) html = await response.text();
      } else {
        const file = ctx.fileFor(side, route);
        if (file) html = fs.readFileSync(file, "utf8");
      }

      htmlCache.set(key, html);
      return html;
    },

    /** cheerio document of a route, or null. */
    async dom(side, route) {
      const html = await ctx.html(side, route);
      return html === null ? null : load(html);
    },

    /** Base URL of a server for `side`, started on first use on an ephemeral port. */
    async serve(side) {
      if (side === "candidate" && candidateUrl) return candidateUrl;
      if (!servers.has(side)) servers.set(side, await startServer(dirs[side]));
      return servers.get(side).url;
    },

    /** Write a JSON report to .verify/report/<name>.json and return its path. */
    report(name, data) {
      fs.mkdirSync(reportDir, { recursive: true });
      const file = path.join(reportDir, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      return file;
    },

    async close() {
      await Promise.all([...servers.values()].map((server) => server.close()));
      servers.clear();
    },
  };

  return ctx;
}

export async function loadChecks({ only = [], staticOnly = false } = {}) {
  if (!fs.existsSync(checksDir)) return [];
  const files = fs
    .readdirSync(checksDir)
    .filter((file) => file.endsWith(".mjs"))
    .sort();

  const checks = [];
  for (const file of files) {
    const module = await import(pathToFileURL(path.join(checksDir, file)).href);
    const check = module.default;
    if (!check?.name || typeof check.run !== "function") {
      throw new Error(`${file}: default export must be { name, kind, run(ctx) }`);
    }
    if (only.length && !only.includes(check.name)) continue;
    if (staticOnly && check.kind !== "static") continue;
    checks.push(check);
  }
  return checks;
}

export async function runChecks(ctx, checks) {
  const results = [];
  for (const check of checks) {
    const started = performance.now();
    let result;
    try {
      result = await check.run(ctx);
    } catch (error) {
      result = { ok: false, pass: 0, fail: 1, failed: [{ route: "-", detail: `check crashed: ${error.stack ?? error}` }] };
    }
    const failed = result.failed ?? [];
    const normalized = {
      check: check.name,
      kind: check.kind,
      ok: Boolean(result.ok),
      pass: result.pass ?? 0,
      fail: result.fail ?? failed.length,
      failed,
      cells: result.cells ?? null,
      durationMs: Math.round(performance.now() - started),
    };
    ctx.report(check.name, { ...normalized, extra: result.extra ?? null });
    results.push(normalized);
  }
  return results;
}

const clip = (text, max = 110) => {
  const flat = String(text).replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** One line per check. Details live in .verify/report/<check>.json. */
export function formatResults(results) {
  return results.map((result) => {
    const head = `${result.ok ? "PASS" : "FAIL"}  ${result.check.padEnd(9)} ${result.pass}/${result.pass + result.fail}`;
    if (result.ok) return head;
    const shown = result.failed.slice(0, 3).map((item) => `${item.route}: ${clip(item.detail)}`);
    const more = result.failed.length > 3 ? ` (+${result.failed.length - 3} more)` : "";
    return `${head}  ${shown.join(" | ")}${more}  → .verify/report/${result.check}.json`;
  });
}

/** routes × checks grid for the progress dashboard. */
export function toMatrix(ctx, results) {
  const checks = results.map((result) => result.check);
  const cells = {};
  for (const result of results) {
    const failedRoutes = new Set(result.failed.map((item) => item.route));
    const perRoute = result.cells !== null || result.failed.some((item) => ctx.allRoutes.includes(item.route));
    for (const route of ctx.routes) {
      let state;
      if (result.cells) state = result.cells[route] ?? "skip";
      else if (perRoute) state = failedRoutes.has(route) ? "fail" : "pass";
      else state = result.ok ? "pass" : "fail";
      cells[`${route}|${result.check}`] = state;
    }
  }
  return { routes: ctx.routes, checks, cells };
}

/** Record a verify event for the progress dashboard. Never throws. */
export async function emitVerify({ scope, args, results, matrix, durationMs }) {
  try {
    const { emit } = await import("../../progress/emit.mjs");
    emit({
      type: "verify",
      scope,
      stage: args.stage ?? process.env.PROGRESS_STAGE,
      agent: args.agent ?? process.env.PROGRESS_AGENT,
      ok: results.every((result) => result.ok),
      durationMs,
      results: results.map(({ check, ok, pass, fail, failed }) => ({
        check,
        ok,
        pass,
        fail,
        failed: failed.slice(0, 20).map((item) => ({ route: item.route, detail: clip(item.detail, 200) })),
      })),
      matrix,
    });
  } catch {
    // The dashboard is optional; verification must not depend on it.
  }
}
