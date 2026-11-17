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

import { PNG } from "pngjs";

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

/** check name → what its capture cache did in the identical run (lib/browser.mjs openCaptureCache). */
const identicalCache = new Map();

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
    for (const result of results)
      if (result.cache) identicalCache.set(result.check, result.cache);
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

const scratch = (prefix) => fs.mkdtempSync(path.join(verifyDir, prefix));

// 1b. the capture cache of the browser checks (lib/browser.mjs openCaptureCache)
for (const check of parityChecks.filter((one) =>
  identicalCache.has(one.name),
)) {
  for (const item of await cacheCases(check, identicalCache.get(check.name)))
    cases.push({ check: check.name, ...item });
}

/** Run `check` on the baseline against itself. → its normalized result (with `cache`) */
async function identicalRun(check, options) {
  const ctx = createContext({
    candidateDir: baselineDir,
    accept: false,
    ...options,
  });
  try {
    return (await runChecks(ctx, [check]))[0];
  } finally {
    await ctx.close();
  }
}

/**
 * The identical run used the cache with hits and spot checks, and a cache that holds wrong captures can neither
 * fail nor pass a check by itself: entries made to differ from what the baseline looks like now are found and
 * dropped, and the check comes out as it would without the cache. Those two cases use a cache of their own.
 */
async function cacheCases(check, identical) {
  const found = [];
  const hitAndSpot = (cache) =>
    cache.enabled &&
    !cache.invalidated &&
    !cache.droppedBy &&
    cache.spotChecked > 0 &&
    (cache.hits > 0 || cache.misses + cache.spotChecked === 1);
  // A cold cache (another baseline, changed capturing code) is filled by the identical run: the next one hits.
  let cache = identical;
  for (let again = 0; again < 2 && !hitAndSpot(cache); again += 1)
    cache = (await identicalRun(check, { args })).cache ?? cache;
  found.push({
    name: "cache: 기준선 ↔ 기준선에서 캐시 적중과 표본 재확인",
    ok: hitAndSpot(cache),
    detail: hitAndSpot(cache)
      ? ""
      : `cache not exercised: ${JSON.stringify(cache)}`,
  });

  // Few routes, but more than one entry, so that entries can be swapped. Not narrowed by --route.
  const route =
    check.name === "visual" ? ["/"] : ["/", "/posts/proxy-to-built-in-objects"];
  for (const [name, poison, spotChecks, why] of [
    [
      "cache: 실패 뒤 다시 찍은 기준선이 캐시와 다르면 캐시를 버린다",
      swapEntries,
      0, // guard a alone
      /after a failure/,
    ],
    [
      "cache: 표본으로 다시 찍은 기준선이 캐시와 바이트까지 같지 않으면 캐시를 버린다",
      reencodeEntries,
      Number.POSITIVE_INFINITY, // every hit is a spot check; the entries still compare equal
      /spot check/,
    ],
  ]) {
    const dir = scratch("capture-cache-");
    let mutant = null;
    try {
      const options = { args: { ...args, route }, captureCache: dir };
      const filled = await identicalRun(check, options);
      if (!filled.cache?.stored)
        throw new Error(`nothing was stored: ${JSON.stringify(filled.cache)}`);
      let changed = poison(path.join(dir, check.name));
      // Guard a only runs when a comparison fails. When every entry holds the same bytes (a11y on a baseline
      // without violations: every route is `{"violations":[]}`), swapping changes nothing, and the baseline
      // compared with itself cannot fail. Then the candidate is the check's first mutation, which must fail,
      // and the entries get other bytes for the same value, which only a fresh capture tells apart.
      const mutation = check.selftest?.mutations?.[0];
      if (!changed && poison === swapEntries && mutation) {
        mutant = scratch("mutant-");
        fs.cpSync(baselineDir, mutant, { recursive: true });
        await mutation.apply?.(mutant);
        changed = reencodeEntries(path.join(dir, check.name));
      }
      if (!changed)
        throw new Error("the entries are all the same: nothing to make wrong");
      const result = await identicalRun(check, {
        ...options,
        ...(mutant ? { candidateDir: mutant } : {}),
        captureSpotChecks: spotChecks,
      });
      const dropped = result.cache?.droppedBy?.invalidated ?? "";
      let detail = "";
      if (mutant && (result.ok || result.vacuous))
        detail = `the check did not notice the mutation (${mutation.name}) after dropping the cache: ${JSON.stringify(result.cache)}`;
      else if (!mutant && !result.ok)
        detail = `the wrong cache failed the check: ${result.failed[0]?.detail ?? "failed"}`;
      else if (!why.test(dropped))
        detail = `the wrong entries were not found (${why}): ${JSON.stringify(result.cache)}`;
      else if (result.cache.mode !== "refill" || result.cache.hits)
        detail = `the check did not run again without reading the cache: ${JSON.stringify(result.cache)}`;
      found.push({ name, ok: !detail, detail });
    } catch (error) {
      found.push({
        name,
        ok: false,
        detail: `could not be run: ${String(error?.message ?? error).split("\n")[0]}`,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      if (mutant) fs.rmSync(mutant, { recursive: true, force: true });
    }
  }
  return found;
}

/** Every entry gets the bytes of the next one: each is a capture of something else. → whether any entry changed */
function swapEntries(dir) {
  const files = fs
    .readdirSync(dir)
    .sort()
    .map((name) => path.join(dir, name));
  if (files.length < 2)
    throw new Error(`${files.length} entry, nothing to swap`);
  const contents = files.map((file) => fs.readFileSync(file));
  for (const [index, file] of files.entries())
    fs.writeFileSync(file, contents[(index + 1) % files.length]);
  return contents.some((bytes) => !bytes.equals(contents[0]));
}

/** Every entry gets other bytes for the same thing: a PNG encoded again, JSON with a space after it. → true */
function reencodeEntries(dir) {
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    const bytes = fs.readFileSync(file);
    let other = Buffer.concat([bytes, Buffer.from(" ")]);
    if (bytes.subarray(1, 4).toString() === "PNG") {
      const image = PNG.sync.read(bytes);
      other = [0, 1, 2, 3, 4]
        .map((filterType) => PNG.sync.write(image, { filterType }))
        .find((encoded) => !encoded.equals(bytes));
    }
    fs.writeFileSync(file, other);
  }
  return true;
}

// 2. mutations (the check must FAIL) and accepted changes (the check must still PASS)

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
        // The mutated side is never taken from the capture cache: the candidate never is, and a mutated
        // reference is not the baseline the cache holds.
        captureCache: !reference,
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
