// npm run verify -- [--only=head,content] [--route=/posts/x] [--static] [--no-build] [--no-check]
//                    [--candidate=<dir> | --candidate-url=<url>] [--selector=<css>]
//                    [--stage=S1.3 --agent=SK] [--scope=integration]
// npm run verify -- --feature [--only=seo,links] [--route=/posts/x] [--no-build] [--no-check] [--candidate=<dir>]
//
// astro check → astro build --force → checks in scripts/verify/checks/*.mjs.
// Without --feature every check runs, and the parity checks compare the build with the baseline
// (.verify/baseline, the deployed site extracted from origin/gh-pages by `npm run verify:setup`).
// With --feature there is no baseline: only the checks that never read it run (scope "feature", and links), on the
// routes of the build. That is the gate of pull requests and of the deploy workflow; a post they add is a route
// the baseline does not have.
// Prints one line per check; details go to .verify/report/. Exit code 0 only if everything passed,
// 1 when a check failed, 2 when the command line asks for something that does not exist.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

import { baselineDir, distDir, repoRoot, reportDir } from "./lib/paths.mjs";
import { listRoutes } from "./lib/resolve.mjs";
import {
  createContext,
  emitVerify,
  exitWithUsage,
  formatResults,
  loadChecks,
  parseArgsOrExit,
  readsBaseline,
  runChecks,
  scopeOf,
  selectChecks,
  toMatrix,
  UsageError,
  validateRoutes,
  validateSelection,
} from "./lib/runner.mjs";

const USAGE =
  "usage: npm run verify -- [--only=<check,…>] [--route=<route,…>] [--static] [--no-build] [--no-check]\n" +
  "                         [--candidate=<dir> | --candidate-url=<url>] [--selector=<css>]\n" +
  "                         [--stage=<id>] [--agent=<id>] [--scope=local|agent|integration]\n" +
  "       npm run verify -- --feature [--only=<check,…>] [--route=<route,…>] [--no-build] [--no-check]\n" +
  "                         [--candidate=<dir>] [--stage=<id>] [--agent=<id>] [--scope=…]   (no baseline)";

/** Flags that only mean something next to the baseline, and why: refused with --feature. */
const PARITY_FLAGS = {
  candidateUrl: [
    "--candidate-url",
    "a deployed site cannot be listed, so its routes would come from the baseline",
  ],
  selector: [
    "--selector",
    "it narrows visual, which compares screenshots with the baseline",
  ],
};

const args = parseArgsOrExit("run", USAGE);
const started = performance.now();

if (!args.feature && !fs.existsSync(path.join(baselineDir, "index.html"))) {
  console.error(
    "baseline missing — run `npm run verify:setup` first (`npm run verify -- --feature` needs none)",
  );
  process.exit(2);
}

// Everything the command line names has to exist before anything is built: a filter that matches nothing
// would otherwise end in a run with nothing to fail. With --feature the routes are the build's, so before the build
// a route is only checked for how it is written, and against the build's routes after it (checkCandidateRoutes).
let checks;
let scope;
try {
  scope = scopeOf(args);
  if (args.candidate && args.candidateUrl)
    throw new UsageError("give at most one of --candidate and --candidate-url");

  const available = await loadChecks();
  if (args.feature) {
    const flags = Object.entries(PARITY_FLAGS)
      .filter(([key]) => args[key] !== undefined)
      .map(([, [flag, why]]) => `${flag} (${why})`);
    if (flags.length)
      throw new UsageError(`not with --feature: ${flags.join("; ")}`);
  }
  validateSelection(args, {
    checkNames: available.map((check) => check.name),
    routes: args.feature ? null : listRoutes(baselineDir),
  });
  if (args.feature) {
    const parity = available
      .filter((check) => args.only.includes(check.name) && readsBaseline(check))
      .map((check) => check.name);
    if (parity.length)
      throw new UsageError(
        `not with --feature: ${parity.join(", ")} ${parity.length > 1 ? "compare" : "compares"} the build with the baseline\n` +
          `checks that run without a baseline: ${available
            .filter((check) => !readsBaseline(check))
            .map((check) => check.name)
            .join(", ")}`,
      );
  }
  checks = selectChecks(available, {
    only: args.only,
    staticOnly: args.static,
    feature: args.feature,
  });
  // A check that was asked for by name and then left out would be one line less to read, not a failure.
  const dropped = args.only.filter(
    (name) => !checks.some((check) => check.name === name),
  );
  if (dropped.length || checks.length === 0)
    throw new UsageError(
      `nothing to run for ${dropped.join(", ") || "this selection"}: --static leaves out browser checks`,
    );
} catch (error) {
  exitWithUsage(error, USAGE);
}

fs.mkdirSync(reportDir, { recursive: true });

/** Where the explanation under an error ends: a section of an Astro error, a code frame, a stack frame. */
const EXPLANATION_ENDS =
  /^\s*(?:(?:Hint|Error reference|Location|Stack trace):$|[│╭╰])|^\s+at\s/;
const EXPLANATION_LINES = 4;

/**
 * The first error in a step's log and the lines under it that explain it, without colour codes (Astro colours
 * its errors even with FORCE_COLOR=0) and timestamps. The end of the log would say nothing: an Astro error ends
 * with its documentation URL, the location and a stack trace.
 *
 *   [InvalidContentEntryDataError] posts → foo data does not match collection schema.   ← the first line that says "error"
 *
 *     ****: Unrecognized key: "desciption"                                               ← indented under it: the explanation
 *
 *     Hint:                                                                              ← where the explanation ends
 *
 * The explanation also ends at an unindented line after a blank one (astro check prints the source line there).
 * Astro writes an issue as **<key>**: <message> and its error formatter makes the key bold. A key the schema does
 * not know is reported at the object, with an empty key, and "****" is left as it is; the asterisks and the empty
 * key are dropped. A log without a line that says "error" gives its last lines before the first stack trace or
 * code frame ("[astro] Unable to load your Astro config ⏎ Tsconfig not found …").
 */
function firstError(log) {
  const lines = stripVTControlCharacters(log)
    .split("\n")
    .map((line) => line.trimEnd().replace(/^\d\d:\d\d:\d\d /, ""));
  const at = lines.findIndex((line) => /error\b/i.test(line));
  if (at === -1) {
    const end = lines.findIndex((line) => EXPLANATION_ENDS.test(line));
    return {
      error: lines
        .slice(0, end === -1 ? undefined : end)
        .filter(Boolean)
        .slice(-3)
        .map((line) => line.trim())
        .join(" ⏎ "),
      explanation: [],
    };
  }

  const explanation = [];
  let afterBlank = false;
  for (const line of lines.slice(at + 1)) {
    if (!line.trim()) {
      afterBlank = true;
      continue;
    }
    if (
      EXPLANATION_ENDS.test(line) ||
      (afterBlank && !/^\s/.test(line)) ||
      explanation.length === EXPLANATION_LINES
    )
      break;
    explanation.push(
      line
        .trim()
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/^:\s*/, ""),
    );
  }
  return { error: lines[at].trim(), explanation };
}

function step(name, command) {
  const begun = performance.now();
  const run = spawnSync(command[0], command.slice(1), {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
  });
  const log = `${run.stdout ?? ""}\n${run.stderr ?? ""}`;
  fs.writeFileSync(path.join(reportDir, `${name}.log`), log);
  const ok = run.status === 0;
  // A failed step is one failure (fail: 1). Its result line shows the error, what explains it and where the
  // whole log is, each as an item of its own: formatResults cuts every item at 110 characters, and the error line
  // of an Astro content error alone is about 90.
  const { error, explanation } = ok
    ? { error: "", explanation: [] }
    : firstError(log);
  const said = [
    error || run.error?.message || `exit status ${run.status ?? run.signal}`,
    explanation.join(" ⏎ "),
    `see .verify/report/${name}.log`,
  ];
  return {
    check: name,
    kind: "static",
    ok,
    pass: ok ? 1 : 0,
    fail: ok ? 0 : 1,
    failed: ok
      ? []
      : said.filter(Boolean).map((detail) => ({ route: "-", detail })),
    cells: null,
    durationMs: Math.round(performance.now() - begun),
  };
}

const results = [];
const builds = !args.candidate && !args.candidateUrl && !args.noBuild;
const candidateDir = args.candidate ? path.resolve(args.candidate) : distDir;

/** With --feature, --route picks from the routes of the build: refused with 2, like every other route that is not there. */
function checkCandidateRoutes() {
  if (!args.feature) return;
  try {
    validateRoutes(
      args.route,
      fs.existsSync(candidateDir) ? listRoutes(candidateDir) : [],
      "candidate",
    );
  } catch (error) {
    exitWithUsage(error, USAGE);
  }
}

// A candidate that is not built here is there already: its routes are known before anything runs.
if (!builds) checkCandidateRoutes();

if (builds) {
  // `npm run check`, not `npx astro check`: Astro 7.4 refuses `astro check` when the project's TypeScript is 7.
  // The script runs the same checker from tools/astro-check, which carries its own TypeScript 6.
  if (!args.noCheck) results.push(step("check", ["npm", "run", "-s", "check"]));
  // --force: render every page from its source. A plain build takes the HTML of unchanged posts from
  // node_modules/.astro/data-store.json, and that store does not notice a changed renderer package, so the
  // gate could pass on pages the deploy workflow (a clean checkout, nothing stored) would render differently.
  results.push(step("build", ["npx", "astro", "build", "--force"]));
}

const buildFailed = results.some(
  (result) => result.check === "build" && !result.ok,
);
if (builds && !buildFailed) checkCandidateRoutes();

const ctx = createContext({
  candidateDir,
  candidateUrl: args.candidateUrl ?? null,
  // --feature: no baseline. The routes are the candidate's, and a check that reads the baseline crashes (FAIL).
  baseline: args.feature ? null : baselineDir,
  args,
});

try {
  if (!buildFailed) results.push(...(await runChecks(ctx, checks)));
} finally {
  await ctx.close();
}

for (const line of formatResults(results)) console.log(line);

const ok = results.length > 0 && results.every((result) => result.ok);
const durationMs = Math.round(performance.now() - started);
console.log(
  `${ok ? "ALL PASS" : "FAILED"}  ${results.filter((r) => r.ok).length}/${results.length} checks  ${(durationMs / 1000).toFixed(1)}s`,
);

await emitVerify({
  // An ad-hoc run is "local". Only an explicit --scope=integration reaches the dashboard's integration view.
  scope,
  args,
  results,
  matrix: toMatrix(
    ctx,
    results.filter(
      (result) => result.check !== "check" && result.check !== "build",
    ),
  ),
  durationMs,
});

process.exit(ok ? 0 : 1);
