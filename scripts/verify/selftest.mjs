// npm run verify:selftest -- [--only=head,cli] [--route=/posts/x] [--static] [--calibrate] [--shard=<i>/<n>] [--list]
//
// Proves the harness can tell "same" from "different":
//   1. baseline vs baseline            → every parity check must PASS
//   2. baseline vs a mutated copy      → the check that declared the mutation must FAIL
//
// Feature checks (scope: "feature") assert things about the build alone. They are tested against the current
// build instead:
//   1. dist/ as it is                  → the check must PASS
//   2. a mutated copy of dist/         → the check must FAIL
//
// And that the commands themselves cannot be talked into a pass (lib/cli-cases.mjs, selected as "cli"):
//   3. command lines that ask for something that does not exist, a build from leftovers, accept files
//      (applied, stale, masked, unused, refused without a reason)   → refused, FAIL or ACCEPT, as each case says
//
// Accept files (scripts/verify/accepted) never apply here: the mutations must fail whatever they declare.
//
// --shard=<i>/<n> runs the i-th of n disjoint parts of the selected cases: sorted by id ("<check>/<case name>"),
// the k-th case (0-based) belongs to shard (k mod n) + 1. Every case is in exactly one shard, a new case joins one
// by itself. --list prints the ids of the cases that would run, one per line, and runs nothing.
//
// A summary of the cases goes to the reporter module, if there is one (VERIFY_REPORTER, see lib/runner.mjs report()).
import fs from "node:fs";
import path from "node:path";

import { cliCases } from "./lib/cli-cases.mjs";
import { baselineDir, distDir, verifyDir } from "./lib/paths.mjs";
import { listRoutes } from "./lib/resolve.mjs";
import {
  createContext,
  exitWithUsage,
  FLAGS,
  loadChecks,
  parseArgs,
  report,
  runChecks,
  selectChecks,
  UsageError,
  validateSelection,
} from "./lib/runner.mjs";

const USAGE =
  "usage: npm run verify:selftest -- [--only=<check,…|cli>] [--route=<route,…>] [--static] [--calibrate] [--shard=<i>/<n>] [--list]";
/** --only name of the command-level cases. */
const CLI = "cli";

let args;
let shard = null;
try {
  args = parseArgs(process.argv.slice(2), {
    ...FLAGS.selftest,
    shard: "value",
    list: "flag",
  });
  if (args.shard !== undefined) {
    const [, index, count] = /^(\d+)\/(\d+)$/.exec(args.shard) ?? [];
    shard = { index: Number(index), count: Number(count) };
    if (
      !index ||
      shard.count < 1 ||
      shard.index < 1 ||
      shard.index > shard.count
    )
      throw new UsageError(
        `--shard=${args.shard}: expected <i>/<n> with 1 <= i <= n, e.g. --shard=1/3`,
      );
  }
} catch (error) {
  exitWithUsage(error, USAGE);
}
const started = performance.now();

if (!fs.existsSync(path.join(baselineDir, "index.html"))) {
  console.error("baseline missing — run `npm run verify:setup` first");
  process.exit(2);
}

let checks;
const withCli = args.only.length === 0 || args.only.includes(CLI);
try {
  const available = await loadChecks();
  validateSelection(args, {
    checkNames: [...available.map((check) => check.name), CLI],
    routes: listRoutes(baselineDir),
  });
  checks = selectChecks(available, {
    only: args.only,
    staticOnly: args.static,
  });
  // A check that was asked for by name and then left out would be fewer cases to read, not a failure.
  const dropped = args.only.filter(
    (name) => name !== CLI && !checks.some((check) => check.name === name),
  );
  if (dropped.length || (checks.length === 0 && !withCli))
    throw new UsageError(
      `nothing to run for ${dropped.join(", ") || "this selection"}: --static leaves out browser checks`,
    );
} catch (error) {
  exitWithUsage(error, USAGE);
}

const isFeature = (check) => check.scope === "feature";
const UNMUTATED = { parity: "identical", feature: "build passes" };
const variantsOf = (check) => [
  ...(check.selftest?.mutations ?? []).map((mutation) => ({
    mutation,
    label: `mutation: ${mutation.name}`,
    mustFail: true,
  })),
  ...(check.selftest?.accepted ?? []).map((mutation) => ({
    mutation,
    label: `accepted: ${mutation.name}`,
    mustFail: false,
  })),
];
const caseId = (check, name) => `${check}/${name}`;

// Every case this selection holds, then the part of it this shard runs.
const planned = [
  ...checks.flatMap((check) => [
    caseId(check.name, UNMUTATED[isFeature(check) ? "feature" : "parity"]),
    ...variantsOf(check).map(({ label }) => caseId(check.name, label)),
  ]),
  ...(withCli ? cliCases.map((item) => caseId(CLI, item.name)) : []),
].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
const twice = planned.filter((id, index) => planned[index + 1] === id);
if (twice.length) {
  // Two cases with one id could not be told apart in a shard or in the report.
  console.error(`case ids are not unique: ${[...new Set(twice)].join(", ")}`);
  process.exit(2);
}
const selected = new Set(
  shard
    ? planned.filter((_, index) => index % shard.count === shard.index - 1)
    : planned,
);
const runs = (check, name) => selected.has(caseId(check, name));

if (args.list) {
  for (const id of planned) if (selected.has(id)) console.log(id);
  process.exit(0);
}
if (shard)
  console.log(
    `shard ${shard.index}/${shard.count}: ${selected.size} of ${planned.length} cases`,
  );

const parityChecks = checks.filter(
  (check) => !isFeature(check) && runs(check.name, UNMUTATED.parity),
);
const featureChecks = checks.filter(
  (check) => isFeature(check) && runs(check.name, UNMUTATED.feature),
);
const cliSelected = cliCases.filter((item) => withCli && runs(CLI, item.name));
const needsBuild = [...selected].some(
  (id) =>
    id.startsWith(`${CLI}/`) ||
    checks.some((check) => isFeature(check) && id.startsWith(`${check.name}/`)),
);
const cases = [];

if (needsBuild && !fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(
    "dist/ missing — feature checks and the command cases are self-tested against the build; run `npm run build` first",
  );
  process.exit(2);
}

// 1. unmutated: parity checks against the baseline itself, feature checks against the build
for (const [group, candidateDir, name] of [
  [parityChecks, baselineDir, "identical"],
  [featureChecks, distDir, "build passes"],
]) {
  if (!group.length) continue;
  // Without accept files: an accepted difference is not the absence of one.
  const ctx = createContext({ candidateDir, args, accept: false });
  try {
    const results = await runChecks(ctx, group);
    for (const [index, result] of results.entries()) {
      cases.push({
        check: result.check,
        name,
        ok: result.ok,
        detail: result.ok ? "" : (result.failed[0]?.detail ?? "failed"),
      });
      await group[index].selftest?.afterIdentical?.(ctx, result);
    }
  } finally {
    await ctx.close();
  }
}

// 2. mutations (the check must FAIL) and accepted changes (the check must still PASS)
const scratch = (prefix) => fs.mkdtempSync(path.join(verifyDir, prefix));

for (const check of checks) {
  for (const { mutation, label, mustFail } of variantsOf(check)) {
    if (!runs(check.name, label)) continue;
    const mutant = scratch("mutant-");
    // A mutation may also change what the candidate is compared with (`baseline(dir)`): some differences
    // only exist in one direction, and the real baseline cannot show the other one.
    const reference = mutation.baseline ? scratch("reference-") : null;
    try {
      fs.cpSync(isFeature(check) ? distDir : baselineDir, mutant, {
        recursive: true,
      });
      await mutation.apply?.(mutant);
      if (reference) {
        fs.cpSync(baselineDir, reference, { recursive: true });
        await mutation.baseline(reference);
      }

      // `routes` narrows the run to where the mutation shows; --route on the command line wins.
      const declared =
        typeof mutation.routes === "function"
          ? mutation.routes(mutant)
          : mutation.routes;
      const route = args.route.length ? args.route : (declared ?? []);

      const ctx = createContext({
        candidateDir: mutant,
        baseline: reference ?? undefined,
        args: { ...args, route },
        accept: false,
        allowlist: mutation.allowlist,
      });
      try {
        const [result] = await runChecks(ctx, [check]);
        // A check that fails because it looked at nothing has not noticed anything.
        const noticed = !result.ok && !result.vacuous;
        let detail = "";
        if (result.vacuous)
          detail = `nothing was examined (routes: ${route.join(", ") || "all"})`;
        else if (mustFail && !noticed)
          detail = "check did not notice the mutation";
        else if (!mustFail && !result.ok)
          detail = `check took it for a difference: ${result.failed[0]?.detail ?? "failed"}`;
        cases.push({
          check: check.name,
          name: label,
          ok: mustFail ? noticed : result.ok,
          detail,
        });
      } finally {
        await ctx.close();
      }
    } catch (error) {
      cases.push({
        check: check.name,
        name: label,
        ok: false,
        detail: `could not be run: ${String(error?.message ?? error).split("\n")[0]}`,
      });
    } finally {
      fs.rmSync(mutant, { recursive: true, force: true });
      if (reference) fs.rmSync(reference, { recursive: true, force: true });
    }
  }
}

// 3. the commands
if (cliSelected.length) {
  for (const item of cliSelected) {
    let problem;
    try {
      problem = await item.run();
    } catch (error) {
      problem = `case crashed: ${String(error?.stack ?? error).split("\n")[0]}`;
    }
    cases.push({
      check: CLI,
      name: item.name,
      ok: !problem,
      detail: problem ?? "",
    });
  }
}

for (const item of cases) {
  console.log(
    `${item.ok ? "PASS" : "FAIL"}  ${item.check.padEnd(9)} ${item.name}${item.detail ? `  ${item.detail}` : ""}`,
  );
}

const withoutMutation = checks
  .filter((check) => !(check.selftest?.mutations ?? []).length)
  .map((check) => check.name);
if (withoutMutation.length)
  console.log(`WARN  no mutation declared: ${withoutMutation.join(", ")}`);

const ok = cases.length > 0 && cases.every((item) => item.ok);
const durationMs = Math.round(performance.now() - started);
console.log(
  `${ok ? "SELFTEST PASS" : "SELFTEST FAILED"}  ${cases.filter((c) => c.ok).length}/${cases.length} cases  ${(durationMs / 1000).toFixed(1)}s`,
);

await report({
  command: "selftest",
  results: cases.map((item) => ({
    check: `${item.check}/${item.name}`,
    ok: item.ok,
    pass: item.ok ? 1 : 0,
    fail: item.ok ? 0 : 1,
    failed: item.ok ? [] : [{ route: "-", detail: item.detail }],
  })),
  matrix: undefined,
  durationMs,
});

process.exit(ok ? 0 : 1);
