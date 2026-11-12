// Shared engine for run.mjs, selftest.mjs and live.mjs.
// The check-module contract is documented in scripts/verify/README.md.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { load } from "cheerio";

import { startServer } from "../serve.mjs";
import {
  allowlistFile,
  baselineDir,
  cacheDir,
  checksDir,
  distDir,
  mainRoot,
  reportDir,
} from "./paths.mjs";
import { listRoutes, resolve } from "./resolve.mjs";

/** A command line that cannot be run as written. The scripts print the message and exit with status 2. */
export class UsageError extends Error {}

// "flag": present or not, no value. "value": --name=<text>. "list": --name=a,b (may be repeated).
const SHARED_FLAGS = {
  only: "list",
  route: "list",
  stage: "value",
  agent: "value",
};

/** Every flag each command understands. Anything else is a mistake, not something to ignore. */
export const FLAGS = {
  run: {
    ...SHARED_FLAGS,
    static: "flag",
    "no-build": "flag",
    "no-check": "flag",
    candidate: "value",
    "candidate-url": "value",
    scope: "value",
    selector: "value",
  },
  selftest: { ...SHARED_FLAGS, static: "flag", calibrate: "flag" },
  live: { ...SHARED_FLAGS, "base-url": "value", serve: "value" },
};

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * `--no-build` → args.noBuild, `--only=a,b` → args.only = ["a", "b"]. Throws a UsageError for an argument that is
 * not one of `flags`, for a flag given a value and for a value flag given none.
 */
export function parseArgs(argv, flags = FLAGS.run) {
  const args = {};
  for (const [name, kind] of Object.entries(flags)) {
    if (kind === "flag") args[camel(name)] = false;
    if (kind === "list") args[camel(name)] = [];
  }

  const known = Object.keys(flags)
    .map((name) => `--${name}`)
    .join(" ");
  for (const raw of argv) {
    const at = raw.indexOf("=");
    const name = raw.slice(2, at === -1 ? undefined : at);
    const value = at === -1 ? null : raw.slice(at + 1);
    const kind = raw.startsWith("--") ? flags[name] : undefined;

    if (!kind)
      throw new UsageError(`unknown argument: ${raw}\nknown flags: ${known}`);
    if (kind === "flag") {
      if (value !== null) throw new UsageError(`--${name} takes no value`);
      args[camel(name)] = true;
    } else if (value === null || value.trim() === "") {
      throw new UsageError(`--${name} needs a value: --${name}=<…>`);
    } else if (kind === "list") {
      args[camel(name)].push(
        ...value
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else args[camel(name)] = value;
  }
  return args;
}

/**
 * A filter that matches nothing would leave nothing to fail. Throws a UsageError when --only names a check that
 * does not exist or --route a route the baseline does not have.
 */
export function validateSelection(args, { checkNames, routes }) {
  const unknownChecks = args.only.filter((name) => !checkNames.includes(name));
  if (unknownChecks.length)
    throw new UsageError(
      `no such check: ${unknownChecks.join(", ")}\navailable: ${checkNames.join(", ")}`,
    );

  const unknownRoutes = args.route.filter((route) => !routes.includes(route));
  if (unknownRoutes.length) {
    const spelled = unknownRoutes.map((route) => {
      const guess = `/${route}`
        .replace(/\/{2,}/g, "/")
        .replace(/\.html$/, "")
        .replace(/(?<=.)\/$/, "");
      return routes.includes(guess)
        ? `${route} (did you mean ${guess}?)`
        : route;
    });
    throw new UsageError(
      `no such route: ${spelled.join(", ")}\nroutes are written as the baseline serves them: ${routes.slice(0, 3).join(", ")}, …`,
    );
  }
}

/** Where the dashboard files a run of `npm run verify`. "integration" is the view everybody reads: it is never a default. */
export const SCOPES = ["local", "agent", "integration"];

export function scopeOf(args, env = process.env) {
  if (args.scope !== undefined) {
    if (!SCOPES.includes(args.scope))
      throw new UsageError(
        `no such scope: ${args.scope}\navailable: ${SCOPES.join(", ")}`,
      );
    return args.scope;
  }
  return args.agent || env.PROGRESS_AGENT ? "agent" : "local";
}

/** Parse the command line of `command` or print what is wrong with it, followed by `usage`, and exit with 2. */
export function parseArgsOrExit(command, usage) {
  try {
    return parseArgs(process.argv.slice(2), FLAGS[command]);
  } catch (error) {
    exitWithUsage(error, usage);
  }
}

/** Print a UsageError and `usage` and exit with 2. Any other error is rethrown. */
export function exitWithUsage(error, usage) {
  if (!(error instanceof UsageError)) throw error;
  console.error(`${error.message}\n${usage}`);
  process.exit(2);
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
export function createContext({
  candidateDir = distDir,
  candidateUrl = null,
  baseline = baselineDir,
  args = {},
} = {}) {
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
    routes: wanted.length
      ? allRoutes.filter((route) => wanted.includes(route))
      : allRoutes,

    /** Reason string if `item` is an accepted difference for `check`, else null. */
    allowed(check, item) {
      const hit = allowlist.find(
        (entry) =>
          entry.check === check &&
          (entry.item === item ||
            (entry.item.endsWith("**") &&
              item.startsWith(entry.item.slice(0, -2)))),
      );
      return hit ? hit.reason : null;
    },

    /** Absolute path of the file a route resolves to on `side` ("baseline" | "candidate"), or null. */
    fileFor(side, route) {
      const hit = resolve(dirs[side], route);
      return hit.file && (hit.status === 200 || route === "/404")
        ? hit.file
        : null;
    },

    /** HTML source of a route, or null when the route does not exist on that side. */
    async html(side, route) {
      const key = `${side}|${route}`;
      if (htmlCache.has(key)) return htmlCache.get(key);

      let html = null;
      if (side === "candidate" && candidateUrl) {
        try {
          const response = await fetch(candidateUrl + route, {
            redirect: "manual",
          });
          if (response.status === 200) html = await response.text();
        } catch {
          // Unreachable host: the route does not exist as far as the checks are concerned.
        }
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

/** `checks` narrowed by --only and --static. */
export const selectChecks = (checks, { only = [], staticOnly = false } = {}) =>
  checks.filter(
    (check) =>
      (only.length === 0 || only.includes(check.name)) &&
      (!staticOnly || check.kind === "static"),
  );

/** Every check module of scripts/verify/checks, narrowed by `only` and `staticOnly`. */
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
      throw new Error(
        `${file}: default export must be { name, kind, run(ctx) }`,
      );
    }
    checks.push(check);
  }
  return selectChecks(checks, { only, staticOnly });
}

/** Why a check that reported success is not one: it had nothing to look at. Short: it has to fit a result line. */
function nothingExamined(ctx, result) {
  const allowed = (result.extra?.allowed ?? []).map((entry) => entry.item);
  const why =
    ctx.routes.length === 0
      ? "no route is selected"
      : allowed.length
        ? `all it was given is allowlisted (${allowed.slice(0, 3).join(", ")}${allowed.length > 3 ? ", …" : ""}) — widen --route or narrow --only`
        : "the check found nothing to compare";
  return `nothing was examined: ${why}`;
}

export async function runChecks(ctx, checks) {
  const results = [];
  for (const check of checks) {
    const started = performance.now();
    let result;
    try {
      result = await check.run(ctx);
    } catch (error) {
      result = {
        ok: false,
        pass: 0,
        fail: 1,
        failed: [
          { route: "-", detail: `check crashed: ${error.stack ?? error}` },
        ],
      };
    }
    const failed = [...(result.failed ?? [])];
    let ok = Boolean(result.ok);
    let fail = result.fail ?? failed.length;
    const pass = result.pass ?? 0;
    // "0 of 0" is a filter that matched nothing or a route that is exempt, not a verified page.
    const vacuous = ok && pass === 0;
    if (vacuous) {
      ok = false;
      fail += 1;
      failed.push({ route: "-", detail: nothingExamined(ctx, result) });
    }
    const normalized = {
      check: check.name,
      kind: check.kind,
      ok,
      pass,
      fail,
      failed,
      // Failed for having looked at nothing. The self-test must not take this for a noticed mutation.
      vacuous,
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

/** Steps run by run.mjs before the checks. They write a log, not a JSON report. */
const STEPS = new Set(["check", "build"]);

/** One line per check. Details live in .verify/report/<check>.json (a step's in .verify/report/<step>.log). */
export function formatResults(results) {
  return results.map((result) => {
    const head = `${result.ok ? "PASS" : "FAIL"}  ${result.check.padEnd(9)} ${result.pass}/${result.pass + result.fail}`;
    if (result.ok) return head;
    const shown = result.failed
      .slice(0, 3)
      .map((item) => `${item.route}: ${clip(item.detail)}`);
    const more =
      result.failed.length > 3 ? ` (+${result.failed.length - 3} more)` : "";
    // A step's items already end with "see .verify/report/<step>.log".
    const pointer = STEPS.has(result.check)
      ? ""
      : `  → .verify/report/${result.check}.json`;
    return `${head}  ${shown.join(" | ")}${more}${pointer}`;
  });
}

/** routes × checks grid for the progress dashboard. */
export function toMatrix(ctx, results) {
  const checks = results.map((result) => result.check);
  const cells = {};
  for (const result of results) {
    const failedRoutes = new Set(result.failed.map((item) => item.route));
    const perRoute =
      result.cells !== null ||
      result.failed.some((item) => ctx.allRoutes.includes(item.route));
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
  // The self-test runs these commands itself to test them; those runs are not news for the dashboard.
  if (process.env.VERIFY_EMIT === "0") return;
  try {
    // Always the main checkout's emitter, so every worktree writes to the same log.
    const { emit } = await import(
      pathToFileURL(path.join(mainRoot, "scripts", "progress", "emit.mjs")).href
    );
    emit({
      type: "verify",
      scope,
      stage: args.stage ?? process.env.PROGRESS_STAGE,
      agent: args.agent ?? process.env.PROGRESS_AGENT,
      // Zero checks is not a pass: nothing was verified.
      ok: results.length > 0 && results.every((result) => result.ok),
      durationMs,
      results: results.map(({ check, ok, pass, fail, failed }) => ({
        check,
        ok,
        pass,
        fail,
        failed: failed.slice(0, 20).map((item) => ({
          route: item.route,
          detail: clip(item.detail, 200),
        })),
      })),
      matrix,
    });
  } catch {
    // The dashboard is optional; verification must not depend on it.
  }
}
