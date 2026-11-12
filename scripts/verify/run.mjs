// npm run verify -- [--only=head,content] [--route=/posts/x] [--static] [--no-build] [--no-check]
//                    [--candidate=<dir>] [--stage=S1.3 --agent=SK] [--scope=integration]
//
// astro check → astro build → checks in scripts/verify/checks/*.mjs.
// Prints one line per check; details go to .verify/report/. Exit code 0 only if everything passed.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { baselineDir, distDir, repoRoot, reportDir } from "./lib/paths.mjs";
import {
  createContext,
  emitVerify,
  formatResults,
  loadChecks,
  parseArgs,
  runChecks,
  toMatrix,
} from "./lib/runner.mjs";

const args = parseArgs(process.argv.slice(2));
const started = performance.now();

if (!fs.existsSync(path.join(baselineDir, "index.html"))) {
  console.error("baseline missing — run `npm run verify:setup` first");
  process.exit(2);
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
  results.push(step("build", ["npx", "astro", "build"]));
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
  if (!buildFailed) {
    const checks = await loadChecks({
      only: args.only,
      staticOnly: args.static,
    });
    if (checks.length === 0) console.log("(no checks matched)");
    results.push(...(await runChecks(ctx, checks)));
  }
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
  scope:
    args.scope ??
    (args.agent || process.env.PROGRESS_AGENT ? "agent" : "integration"),
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
