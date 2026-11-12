// npm run verify -- [--only=head,content] [--route=/posts/x] [--static] [--no-build] [--no-check]
//                    [--candidate=<dir> | --candidate-url=<url>] [--selector=<css>]
//                    [--write-accept=<name> --reason=<text>]
// npm run verify -- --feature [--only=seo,links] [--route=/posts/x] [--no-build] [--no-check] [--candidate=<dir>]
//
// astro build --force → checks in scripts/verify/checks/*.mjs, with astro check beside them.
// Without --feature every check runs, and the parity checks compare the build with the baseline
// (.verify/baseline, the build of the previous production made by `npm run verify:setup`). Differences declared in
// scripts/verify/accepted/*.json for this baseline are accepted (lib/accept.mjs); --write-accept=<name> writes
// scripts/verify/accepted/<name>.json from the parity failures of this run.
// With --feature there is no baseline: only the checks that never read it run (scope "feature", and links), on the
// routes of the build.
// Prints one line per check; details go to .verify/report/. Exit code 0 only if everything passed or was accepted,
// 1 when a check failed, 2 when the command line asks for something that does not exist.
// A summary of the run goes to the reporter module, if there is one (VERIFY_REPORTER, see lib/runner.mjs report()).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

import {
  acceptFileFor,
  applyAccepts,
  cachedBaselineHash,
} from "./lib/accept.mjs";
import {
  acceptedDir,
  baselineDir,
  distDir,
  repoRoot,
  reportDir,
} from "./lib/paths.mjs";
import { listRoutes } from "./lib/resolve.mjs";
import {
  acceptNotices,
  createContext,
  exitWithUsage,
  formatResults,
  loadChecks,
  parseArgsOrExit,
  readsBaseline,
  report,
  runChecks,
  selectChecks,
  summaryLine,
  toMatrix,
  UsageError,
  validateRoutes,
  validateSelection,
} from "./lib/runner.mjs";

const USAGE =
  "usage: npm run verify -- [--only=<check,…>] [--route=<route,…>] [--static] [--no-build] [--no-check] [--no-cache]\n" +
  "                         [--candidate=<dir> | --candidate-url=<url>] [--selector=<css>]\n" +
  '                         [--write-accept=<name> --reason="<why the difference is intended>"]\n' +
  "       npm run verify -- --feature [--only=<check,…>] [--route=<route,…>] [--no-build] [--no-check]\n" +
  "                         [--candidate=<dir>]   (no baseline)";

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
  writeAccept: ["--write-accept", "it accepts differences from the baseline"],
};

/** Where accept files are read and written. VERIFY_ACCEPTED_DIR is for the self-test. */
const acceptDir = process.env.VERIFY_ACCEPTED_DIR || acceptedDir;

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
try {
  if (args.candidate && args.candidateUrl)
    throw new UsageError("give at most one of --candidate and --candidate-url");
  if (args.writeAccept !== undefined && !args.reason?.trim())
    throw new UsageError(
      '--write-accept needs --reason="<why the difference is intended>"',
    );
  if (args.reason !== undefined && args.writeAccept === undefined)
    throw new UsageError("--reason goes with --write-accept=<name>");
  if (
    args.writeAccept !== undefined &&
    !/^[a-z0-9][a-z0-9._-]*$/i.test(args.writeAccept)
  )
    throw new UsageError(
      `--write-accept=${args.writeAccept}: a file name of letters, digits, ".", "_" and "-"`,
    );

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

/** Run `command` to its end: { stdout, stderr, status, signal, error }, like spawnSync, without blocking. */
function spawnAsync(command) {
  return new Promise((done) => {
    const out = { stdout: "", stderr: "", status: null, signal: null };
    let child;
    try {
      child = spawn(command[0], command.slice(1), {
        cwd: repoRoot,
        env: {
          ...process.env,
          ASTRO_TELEMETRY_DISABLED: "1",
          FORCE_COLOR: "0",
        },
      });
    } catch (error) {
      done({ ...out, error });
      return;
    }
    child.stdout.setEncoding("utf8").on("data", (text) => (out.stdout += text));
    child.stderr.setEncoding("utf8").on("data", (text) => (out.stderr += text));
    child.on("error", (error) => (out.error = error));
    child.on("close", (status, signal) => done({ ...out, status, signal }));
  });
}

async function step(name, command) {
  const begun = performance.now();
  const run = await spawnAsync(command);
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

/** The astro check step, while it runs beside the checks. */
let checking = null;

if (builds) {
  // --force: render every page from its source. A plain build takes the HTML of unchanged posts from
  // node_modules/.astro/data-store.json, and that store does not notice a changed renderer package, so the
  // gate could pass on pages the deploy workflow (a clean checkout, nothing stored) would render differently.
  const BUILD = ["npx", "astro", "build", "--force"];
  results.push(await step("build", BUILD));
}

const buildFailed = results.some(
  (result) => result.check === "build" && !result.ok,
);
if (builds && !buildFailed) checkCandidateRoutes();
// astro check runs beside the checks, not before the build: the checks read dist/ and .verify/ only, and astro check
// reads its sources and the generated types under .astro/. Beside the build it would not be independent: both run
// `astro sync`, which rewrites those types and the content store under node_modules/.astro/ that the build clears and
// fills. It starts once the routes are known to exist, so a run refused with 2 leaves nothing running behind it; its
// result line still comes first, and it is awaited before anything is accepted or printed.
// `npm run check`, not `npx astro check`: Astro 7.4 refuses `astro check` when the project's TypeScript is 7.
// The script runs the same checker from tools/astro-check, which carries its own TypeScript 6.
if (builds && !args.noCheck)
  checking = step("check", ["npm", "run", "-s", "check"]);

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
if (checking) results.unshift(await checking);

/**
 * --write-accept: scripts/verify/accepted/<name>.json with one entry per parity check that failed, for the routes it
 * failed on, then those failures are accepted in this run too. A failed step (check, build) is never accepted.
 */
function writeAccept() {
  const failedStep = results.find(
    (result) =>
      (result.check === "check" || result.check === "build") && !result.ok,
  );
  if (failedStep) {
    console.error(
      `not written: ${failedStep.check} failed, and only differences of a build that went through can be accepted`,
    );
    return;
  }
  const parity = new Set(
    checks.filter(readsBaseline).map((check) => check.name),
  );
  let data;
  try {
    data = acceptFileFor(
      results.filter((result) => parity.has(result.check)),
      { hash: cachedBaselineHash(baselineDir), reason: args.reason.trim() },
    );
  } catch (error) {
    console.log(`not written: ${error.message}`);
    return;
  }
  const name = `${args.writeAccept}.json`;
  const file = path.join(acceptDir, name);
  fs.mkdirSync(acceptDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  const entries = data.entries.map((entry) => ({
    ...entry,
    file: name,
    used: false,
  }));
  for (const result of results) applyAccepts(entries, result);
  console.log(
    `wrote ${file.startsWith(repoRoot + path.sep) ? path.relative(repoRoot, file) : file}:${data.entries.map((entry) => `${entry.check} ${entry.routes.join(",")}`).join("; ")}`,
  );
}
if (args.writeAccept !== undefined) writeAccept();

for (const line of formatResults(results)) console.log(line);
for (const line of acceptNotices(ctx)) console.log(`WARN  ${line}`);

const ok = results.length > 0 && results.every((result) => result.ok);
const durationMs = Math.round(performance.now() - started);
console.log(summaryLine(results, durationMs));

await report({
  command: "verify",
  // A run without a baseline checks less: a reporter can tell it from a full one.
  feature: args.feature,
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
