// npm run verify:selftest -- [--only=head] [--static]
//
// Proves the harness can tell "same" from "different":
//   1. baseline vs baseline            → every parity check must PASS
//   2. baseline vs a mutated copy      → the check that declared the mutation must FAIL
//
// Feature checks (scope: "feature") assert things the old site never had, so the baseline cannot pass them.
// They are tested against the current build instead:
//   1. dist/ as it is                  → the check must PASS
//   2. a mutated copy of dist/         → the check must FAIL
import fs from "node:fs";
import path from "node:path";

import { baselineDir, distDir, verifyDir } from "./lib/paths.mjs";
import {
  createContext,
  emitVerify,
  loadChecks,
  parseArgs,
  runChecks,
} from "./lib/runner.mjs";

const args = parseArgs(process.argv.slice(2));
const started = performance.now();

if (!fs.existsSync(path.join(baselineDir, "index.html"))) {
  console.error("baseline missing — run `npm run verify:setup` first");
  process.exit(2);
}

const checks = await loadChecks({ only: args.only, staticOnly: args.static });
const isFeature = (check) => check.scope === "feature";
const parityChecks = checks.filter((check) => !isFeature(check));
const featureChecks = checks.filter(isFeature);
const cases = [];

if (featureChecks.length && !fs.existsSync(path.join(distDir, "index.html"))) {
  console.error(
    "dist/ missing — feature checks are self-tested against the build; run `npm run build` first",
  );
  process.exit(2);
}

// 1. unmutated: parity checks against the baseline itself, feature checks against the build
for (const [group, candidateDir, name] of [
  [parityChecks, baselineDir, "identical"],
  [featureChecks, distDir, "build passes"],
]) {
  if (!group.length) continue;
  const ctx = createContext({ candidateDir, args });
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

// 2. mutations
for (const check of checks) {
  for (const mutation of check.selftest?.mutations ?? []) {
    const mutant = fs.mkdtempSync(path.join(verifyDir, "mutant-"));
    try {
      fs.cpSync(isFeature(check) ? distDir : baselineDir, mutant, {
        recursive: true,
      });
      await mutation.apply(mutant);
      const ctx = createContext({ candidateDir: mutant, args });
      try {
        const [result] = await runChecks(ctx, [check]);
        cases.push({
          check: check.name,
          name: `mutation: ${mutation.name}`,
          ok: !result.ok,
          detail: result.ok ? "check did not notice the mutation" : "",
        });
      } finally {
        await ctx.close();
      }
    } finally {
      fs.rmSync(mutant, { recursive: true, force: true });
    }
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

await emitVerify({
  scope: "selftest",
  args,
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
