// a11y — the candidate may not have an accessibility violation the baseline does not have ("회귀 금지").
//
//   npm run verify -- --only=a11y --route=/posts/foo
//
// axe-core runs on every route of both sides at one viewport (1280), limited to the WCAG 2.1 A and AA rules.
// A violation is a rule id plus the target selector of one offending element. A route fails when the candidate
// has one the baseline does not. Violations the baseline already has are not counted against the candidate:
// the starting point is the old site, not zero. .verify/report/a11y.json holds every route's violations and,
// once, the baseline's absolute count per rule.
//
// Third-party requests go through the same blocking and replay as `visual` (lib/browser.mjs).
import {
  baselineValue,
  mapLimit,
  MAX_PAGES,
  openBrowser,
  openCaptureCache,
  packageVersion,
  recheck,
  withCaptureCache,
} from "../lib/browser.mjs";
import { editPages } from "../lib/html.mjs";

const NAME = "a11y";
const VIEWPORT = { width: 1280, height: 900 };
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

/** Every violation on the page as "rule-id target", one per offending element, sorted and unique. */
function audit(browser, url, route, AxeBuilder) {
  return browser.withPage(VIEWPORT, async (tab) => {
    const status = await tab.open(url);
    if (status >= 400 && route !== "/404") throw new Error(`HTTP ${status}`);
    if (tab.failures.length)
      throw new Error(`third-party request failed: ${tab.failures[0]}`);

    const { violations } = await new AxeBuilder({ page: tab.page })
      .withTags(TAGS)
      .analyze();
    const keys = new Set();
    const rules = {};
    for (const violation of violations) {
      for (const node of violation.nodes) {
        // A target inside an iframe is a list of selectors, outermost first.
        const target = node.target
          .map((part) => (Array.isArray(part) ? part.join(" ") : part))
          .join(" >> ");
        keys.add(`${violation.id} ${target}`);
        rules[violation.id] = (rules[violation.id] ?? 0) + 1;
      }
    }
    return { violations: [...keys].sort(), rules };
  });
}

const run = (ctx) => withCaptureCache(ctx, (mode) => runOnce(ctx, mode));

async function runOnce(ctx, cacheMode) {
  // Loaded here rather than at the top: every check module is imported even when only static checks run.
  const { AxeBuilder } = await import("@axe-core/playwright");

  const cells = {};
  const allowed = [];
  const routes = [];
  for (const route of ctx.routes) {
    const reason = ctx.allowed(NAME, `route:${route}`);
    if (reason) {
      cells[route] = "skip";
      allowed.push({ item: `route:${route}`, reason });
      continue;
    }
    routes.push(route);
  }

  const browser = await openBrowser(ctx);
  let outcomes;
  let cache;
  try {
    const urls = {
      baseline: await ctx.serve("baseline"),
      candidate: await ctx.serve("candidate"),
    };
    // The baseline's audits, kept from an earlier run (lib/browser.mjs openCaptureCache). axe-core decides them too.
    cache = openCaptureCache(ctx, browser, {
      check: NAME,
      sources: [import.meta.url],
      extra: {
        axe: packageVersion("axe-core"),
        axePlaywright: packageVersion("@axe-core/playwright"),
      },
      mode: cacheMode,
    });
    const plan = cache.plan(
      routes.map((route) => ({ id: route, route, viewport: VIEWPORT })),
    );

    outcomes = await mapLimit(routes, MAX_PAGES, async (route) => {
      const takeBaseline = () =>
        audit(browser, urls.baseline + route, route, AxeBuilder);
      let cached = false;
      const results = await Promise.all([
        baselineValue(cache, plan, route, takeBaseline).then(
          (got) => {
            cached = got.cached;
            return got.value;
          },
          (error) => new Error(`baseline: ${oneLine(error)}`),
        ),
        audit(browser, urls.candidate + route, route, AxeBuilder).catch(
          (error) => new Error(`candidate: ${oneLine(error)}`),
        ),
      ]);
      // Guard a: a failure against a cached baseline audits the baseline again (lib/browser.mjs recheck).
      const failing =
        results.some((result) => result instanceof Error) ||
        results[1].violations.some(
          (key) => !results[0].violations.includes(key),
        );
      if (failing && cached) await recheck(cache, plan, route, takeBaseline);
      const broken = results.find((result) => result instanceof Error);
      if (broken) return { route, ok: false, detail: broken.message };

      const [baseline, candidate] = results;
      const known = new Set(baseline.violations);
      const added = candidate.violations.filter((key) => !known.has(key));
      const outcome = {
        route,
        ok: added.length === 0,
        baseline: baseline.violations.length,
        candidate: candidate.violations.length,
        added,
        baselineViolations: baseline.violations,
        candidateViolations: candidate.violations,
        baselineRules: baseline.rules,
      };
      if (!outcome.ok)
        outcome.detail = `${added.length} new (baseline ${outcome.baseline}, candidate ${outcome.candidate}): ${added.slice(0, 3).join(", ")}`;
      return outcome;
    });
  } finally {
    await browser.close();
  }

  const failed = outcomes
    .filter((outcome) => !outcome.ok)
    .map(({ route, detail }) => ({ route, detail }));
  for (const outcome of outcomes)
    cells[outcome.route] = outcome.ok ? "pass" : "fail";

  // The starting point: how many violations of each rule the baseline has, over every route examined.
  const baselineRules = {};
  for (const outcome of outcomes)
    for (const [rule, count] of Object.entries(outcome.baselineRules ?? {}))
      baselineRules[rule] = (baselineRules[rule] ?? 0) + count;

  return {
    ok: failed.length === 0,
    pass: outcomes.length - failed.length,
    fail: failed.length,
    failed,
    cells,
    extra: {
      tags: TAGS,
      viewport: VIEWPORT,
      baselineRules,
      routes: outcomes.map(({ baselineRules: _rules, ...outcome }) => outcome),
      allowed,
      cache: cache.stats,
    },
  };
}

export default {
  name: NAME,
  kind: "browser",
  run,

  selftest: {
    mutations: [
      {
        name: "이미지의 alt 삭제",
        routes: ["/"],
        apply(dir) {
          // The profile picture on the home page: an image without alt is axe's `image-alt` violation.
          editPages(
            dir,
            /(<img\b[^>]*\bsrc="\/profile\.jpg"[^>]*?) alt="[^"]*"/,
            "$1",
          );
        },
      },
    ],
  },
};
