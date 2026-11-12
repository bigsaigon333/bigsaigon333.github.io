// npm run verify -- [--only=head,content] [--route=/posts/x] [--static] [--no-build] [--no-check]
//                    [--candidate=<dir> | --candidate-url=<url>] [--selector=<css>]
//                    [--stage=S1.3 --agent=SK] [--scope=integration]
//
// astro check → astro build --force → checks in scripts/verify/checks/*.mjs.
// Prints one line per check; details go to .verify/report/. Exit code 0 only if everything passed,
// 1 when a check failed, 2 when the command line asks for something that does not exist.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { baselineDir, distDir, repoRoot, reportDir } from "./lib/paths.mjs";
import { listRoutes } from "./lib/resolve.mjs";
import {
  createContext,
  emitVerify,
  exitWithUsage,
  formatResults,
  loadChecks,
  parseArgsOrExit,
  runChecks,
  scopeOf,
  selectChecks,
  toMatrix,
  UsageError,
  validateSelection,
} from "./lib/runner.mjs";

const USAGE =
  "usage: npm run verify -- [--only=<check,…>] [--route=<route,…>] [--static] [--no-build] [--no-check]\n" +
  "                         [--candidate=<dir> | --candidate-url=<url>] [--selector=<css>]\n" +
  "                         [--stage=<id>] [--agent=<id>] [--scope=local|agent|integration]";
const args = parseArgsOrExit("run", USAGE);
const started = performance.now();

if (!fs.existsSync(path.join(baselineDir, "index.html"))) {
  console.error("baseline missing — run `npm run verify:setup` first");
  process.exit(2);
}

// Everything the command line names has to exist before anything is built: a filter that matches nothing
// would otherwise end in a run with nothing to fail.
let checks;
let scope;
try {
  scope = scopeOf(args);
  if (args.candidate && args.candidateUrl)
    throw new UsageError("give at most one of --candidate and --candidate-url");

  const available = await loadChecks();
  validateSelection(args, {
    checkNames: available.map((check) => check.name),
    routes: listRoutes(baselineDir),
  });
  checks = selectChecks(available, {
    only: args.only,
    staticOnly: args.static,
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
  const tail = log.trim().split("\n").slice(-6).join(" ⏎ ");
  return {
    check: name,
    kind: "static",
    ok,
    pass: ok ? 1 : 0,
    fail: ok ? 0 : 1,
    failed: ok
      ? []
      : [{ route: "-", detail: `${tail}  (see .verify/report/${name}.log)` }],
    cells: null,
    durationMs: Math.round(performance.now() - begun),
  };
}

const results = [];
const builds = !args.candidate && !args.candidateUrl && !args.noBuild;

if (builds) {
  if (!args.noCheck) results.push(step("check", ["npx", "astro", "check"]));
  // --force: render every page from its source. A plain build takes the HTML of unchanged posts from
  // node_modules/.astro/data-store.json, and that store does not notice a changed renderer package, so the
  // gate could pass on pages the deploy workflow (a clean checkout, nothing stored) would render differently.
  results.push(step("build", ["npx", "astro", "build", "--force"]));
}

const buildFailed = results.some(
  (result) => result.check === "build" && !result.ok,
);
const ctx = createContext({
  candidateDir: args.candidate ? path.resolve(args.candidate) : distDir,
  candidateUrl: args.candidateUrl ?? null,
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
