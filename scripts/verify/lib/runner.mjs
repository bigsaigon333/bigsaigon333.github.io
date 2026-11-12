// Shared engine for run.mjs, selftest.mjs and live.mjs.
// The check-module contract is documented in scripts/verify/README.md.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { load } from "cheerio";

import { startServer } from "../serve.mjs";
import {
  applyAccepts,
  cachedBaselineHash,
  loadAccepts,
  masksFor,
  unusedNotices,
} from "./accept.mjs";
import {
  acceptedDir,
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
};

/** Every flag each command understands. Anything else is a mistake, not something to ignore. */
export const FLAGS = {
  run: {
    ...SHARED_FLAGS,
    feature: "flag",
    static: "flag",
    "no-build": "flag",
    "no-check": "flag",
    candidate: "value",
    "candidate-url": "value",
    selector: "value",
    "write-accept": "value",
    reason: "value",
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

/** How lib/resolve.mjs listRoutes() would write `route` ("posts/a.html" → "/posts/a"). */
const spelledAsRoute = (route) =>
  `/${route}`
    .replace(/\/{2,}/g, "/")
    .replace(/\.html$/, "")
    .replace(/(?<=.)\/$/, "");

/**
 * A filter that matches nothing would leave nothing to fail. Throws a UsageError when --only names a check that
 * does not exist or --route a route the baseline does not have. With `routes: null` (a run without a baseline,
 * before the candidate is built) a route is only checked for being written as one; validateRoutes() checks it
 * against the candidate's routes once there is a candidate.
 */
export function validateSelection(args, { checkNames, routes }) {
  const unknownChecks = args.only.filter((name) => !checkNames.includes(name));
  if (unknownChecks.length)
    throw new UsageError(
      `no such check: ${unknownChecks.join(", ")}\navailable: ${checkNames.join(", ")}`,
    );

  if (routes !== null) {
    validateRoutes(args.route, routes, "baseline");
    return;
  }
  // A trailing "/" is left to validateRoutes(): it is how a directory index (a/index.html → "/a/") is written.
  const misspelt = args.route.filter(
    (route) => spelledAsRoute(route) !== route.replace(/(?<=.)\/$/, ""),
  );
  if (misspelt.length)
    throw new UsageError(
      `no such route: ${misspelt.map((route) => `${route} (did you mean ${spelledAsRoute(route)}?)`).join(", ")}\nroutes are written as the site serves them: /, /404, /posts/<id>`,
    );
}

/** Throws a UsageError when one of `wanted` is not one of `routes`, the HTML routes of `side`. */
export function validateRoutes(wanted, routes, side) {
  const unknownRoutes = wanted.filter((route) => !routes.includes(route));
  if (unknownRoutes.length) {
    const spelled = unknownRoutes.map((route) => {
      const guess = spelledAsRoute(route);
      return routes.includes(guess)
        ? `${route} (did you mean ${guess}?)`
        : route;
    });
    throw new UsageError(
      `no such route: ${spelled.join(", ")}\nroutes are written as the ${side} serves them: ${routes.slice(0, 3).join(", ")}, …`,
    );
  }
}

/**
 * Whether a check reads the baseline. A parity check compares the candidate with it. A feature check (scope
 * "feature") and a check that declares `candidateOnly: true` (links) look at the candidate alone: only those run
 * with --feature, where there is no baseline.
 */
export const readsBaseline = (check) =>
  check.scope !== "feature" && check.candidateOnly !== true;

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
 * @param {string|null} [options.baseline] reference site (default: .verify/baseline). null: a run without one
 *                                         (--feature): the routes are the candidate's and reading the baseline throws
 * @param {object} [options.args]          parsed CLI args
 * @param {object[]} [options.allowlist]  entries added to allowlist.json (a self-test variant declares its own)
 * @param {boolean} [options.accept]       apply the accept files (scripts/verify/accepted, or $VERIFY_ACCEPTED_DIR)
 *                                         that were written for this baseline. The self-test's mutations run without.
 */
export function createContext({
  candidateDir = distDir,
  candidateUrl = null,
  baseline = baselineDir,
  args = {},
  accept = true,
  allowlist: extraAllowlist = [],
} = {}) {
  if (baseline === null && candidateUrl)
    throw new Error(
      "a run without a baseline needs a directory: a deployed site cannot be listed",
    );
  const allRoutes =
    baseline !== null
      ? listRoutes(baseline)
      : fs.existsSync(candidateDir)
        ? listRoutes(candidateDir)
        : [];
  const wanted = args.route ?? [];
  const allowlist = [...loadAllowlist(), ...extraAllowlist];
  const accepts =
    accept && baseline !== null
      ? loadAccepts(
          cachedBaselineHash(baseline),
          process.env.VERIFY_ACCEPTED_DIR || acceptedDir,
        )
      : { entries: [], notices: [] };
  const dirs = { baseline, candidate: candidateDir };
  const htmlCache = new Map();
  const servers = new Map();
  /** Directory of `side`. A check that reads the baseline in a run without one has nothing to compare with. */
  const dirOf = (side) => {
    if (side === "baseline" && baseline === null)
      throw new Error(
        'this run has no baseline (--feature), but the check reads it: only a check that never does may have scope "feature" or candidateOnly',
      );
    return dirs[side];
  };

  const ctx = {
    args,
    baselineDir: baseline,
    candidateDir,
    candidateUrl,
    reportDir,
    cacheDir,
    /** Every HTML route of the baseline: "/", "/404", "/posts/<id>". In a run without a baseline, the candidate's. */
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

    /** Entries of the accept files that apply to this baseline, and a line for each file that does not. */
    accepts,

    /** CSS selectors an accept entry masks for `check` on `route` (visual and hover). */
    masks(check, route) {
      return masksFor(accepts.entries, check, route).flatMap(
        (entry) => entry.mask,
      );
    },

    /** A mask of `check` covered something on `route`: its entries are not unused. */
    masked(check, route) {
      for (const entry of masksFor(accepts.entries, check, route))
        entry.used = true;
    },

    /** Absolute path of the file a route resolves to on `side` ("baseline" | "candidate"), or null. */
    fileFor(side, route) {
      const hit = resolve(dirOf(side), route);
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
      if (!servers.has(side)) servers.set(side, await startServer(dirOf(side)));
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

/** `checks` narrowed by --only, --static and --feature (the checks that do not read the baseline). */
export const selectChecks = (
  checks,
  { only = [], staticOnly = false, feature = false } = {},
) =>
  checks.filter(
    (check) =>
      (only.length === 0 || only.includes(check.name)) &&
      (!staticOnly || check.kind === "static") &&
      (!feature || !readsBaseline(check)),
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
    // Failures an accept file declares as intended become accepted ones (ACCEPT, not PASS).
    if (ctx.accepts) applyAccepts(ctx.accepts.entries, normalized);
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
    const accepted = result.accepted?.length ?? 0;
    const state = !result.ok ? "FAIL" : accepted ? "ACCEPT" : "PASS";
    const total = result.pass + result.fail + accepted;
    const head = `${state}  ${result.check.padEnd(9)} ${result.pass}/${total}${accepted ? `  ${accepted} accepted` : ""}`;
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

/**
 * The routes × checks grid of a run: { routes, checks, cells: { "<route>|<check>": "pass" | "fail" | "skip" } } over
 * the selected routes. A check that reports `cells` fills its column itself; one whose failures name routes fails
 * those and passes the rest; any other check gives every route its own result.
 */
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

/** The reporter module a run hands its summary to, or null for none. See report(). */
function reporterFile(env = process.env) {
  const setting = env.VERIFY_REPORTER ?? "";
  if (setting === "off") return null;
  // Relative to the main checkout, so that a run in any worktree finds the same module.
  if (setting !== "") return path.resolve(mainRoot, setting);
  const local = path.join(mainRoot, ".verify", "reporter.mjs");
  return fs.existsSync(local) ? local : null;
}

/**
 * Hand a summary of the run to a reporter module, when there is one:
 *   VERIFY_REPORTER=off      none
 *   VERIFY_REPORTER=<path>   that module (absolute, or relative to the main checkout)
 *   unset or empty           <main checkout>/.verify/reporter.mjs, when that file exists (nothing here creates it)
 * The module's default export is awaited with { command, ok, durationMs, results, matrix }, plus feature: true for a
 * run of `verify --feature`. `command` is "verify", "selftest" or "live"; `results` holds per check { check, ok,
 * pass, fail, failed } with at most 20 failures of { route, detail }; `matrix` is toMatrix() of the run, or undefined.
 * Never throws and never changes the exit code: a reporter that cannot be loaded or throws costs one line on stderr.
 */
export async function report({
  command,
  results,
  matrix,
  durationMs,
  feature = false,
}) {
  let file = null;
  try {
    file = reporterFile();
    if (file === null) return;
    const summary = {
      command,
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
      ...(feature ? { feature: true } : {}),
    };
    const reporter = await import(pathToFileURL(file).href);
    await reporter.default(summary);
  } catch (error) {
    const message = String(error?.message ?? error).split("\n")[0];
    console.error(
      `verify: reporter ${file ?? process.env.VERIFY_REPORTER} failed: ${message}`,
    );
  }
}

/** Lines to print after a run: accept files written for another baseline, and entries that accepted nothing. */
export const acceptNotices = (ctx) =>
  ctx.accepts
    ? [...ctx.accepts.notices, ...unusedNotices(ctx.accepts.entries)]
    : [];

/** The summary line: ALL PASS (with how many failures were accepted) or FAILED. */
export function summaryLine(results, durationMs) {
  const ok = results.length > 0 && results.every((result) => result.ok);
  const accepted = results.reduce(
    (sum, result) => sum + (result.accepted?.length ?? 0),
    0,
  );
  return `${ok ? "ALL PASS" : "FAILED"}  ${results.filter((r) => r.ok).length}/${results.length} checks${accepted ? `  ${accepted} accepted` : ""}  ${(durationMs / 1000).toFixed(1)}s`;
}
