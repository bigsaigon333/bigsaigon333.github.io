// perf — lab performance of four representative pages must not get worse than scripts/verify/perf-budget.json.
//
//   npm run verify -- --no-check --only=perf                      # the four pages, third parties blocked (the gate)
//   VERIFY_PERF_THIRD_PARTY=1 npm run verify -- --no-build --no-check --only=perf   # also with GA and utterances
//   VERIFY_PERF_WRITE_BUDGET=1 npm run verify -- --no-build --no-check --only=perf  # lower the budget to this run
//
// Lighthouse (mobile preset: Moto G Power screen, 150 ms RTT, 1.6 Mbps, 4× CPU) with SIMULATED throttling (Lantern):
// the page loads unthrottled and the metrics are computed from the observed request graph and main-thread tasks. So a
// busy machine (CI, other verify lanes) moves the numbers far less than devtools throttling would, and the median of
// RUNS runs per page, each metric on its own, takes out what is left.
//
// The site is served the way GitHub Pages serves it: the same path resolution (lib/resolve.mjs), gzip for text and
// `cache-control: max-age=600`. Without gzip the byte counts and Lantern's download times would be several times
// those of production.
//
// Pages (PAGES): "/" (home), a plain post, the post with math (KaTeX CSS and fonts), the post with the most images.
// A page of PAGES missing from the build fails. --route measures the routes it names instead, any of the build's: a
// route outside PAGES is held to the loosest limit of each metric over the four entries (so `--feature --route=<new
// post>` measures the new post).
//
// Each page is measured with off-site requests blocked (BLOCKED): GA, utterances. These numbers are the gate: they
// depend on this repository only. With VERIFY_PERF_THIRD_PARTY=1 every page is also measured with the GA loader and
// utterances allowed (GA's collect endpoints stay blocked: a lab run must not count as a visit). Those numbers are
// reported (extra.thirdParty) but not gated: gtag.js is whatever Google serves that day.
//
// Items, one per page: every metric of perf-budget.json pages[route] is within its limit. A metric is a median over RUNS (lcp: the lowest):
//   score         Lighthouse performance score, 0–100          at least the budget
//   lcp fcp si    Largest/First Contentful Paint, Speed Index, ms   at most the budget
//   tbt           Total Blocking Time, ms                       at most the budget
//   cls           Cumulative Layout Shift                       at most the budget
//   bytes js css  transferred bytes (gzip), all / scripts / stylesheets          at most the budget
//   blocking      render-blocking requests (render-blocking-insight)             at most the budget
// A route of PAGES without a budget entry fails ("no budget"), as does a budget entry for an unknown metric. The
// result has no `cells`: four pages are measured, not every route.
//
// Report extra: per page the median and every run of each metric, bytes by resource type, unused CSS bytes, the
// render-blocking URLs, third-party cost (with VERIFY_PERF_THIRD_PARTY), and the Lighthouse opportunities and
// diagnostics with their estimated savings (median run), so the next step can be picked from the report.
//
// Allowlist: none. Lower the budget when a change makes a page faster (perf-budget.json "margins" says how).
// The budget is the gate of CI, so it comes from CI's numbers: the medians of a GitHub-hosted runner (the job summary
// and the perf-report artifact of checks.yml), which are well above a laptop's (WB-review: FCP of the math post 840 ms
// on a laptop, 1107 ms on the runner). VERIFY_PERF_WRITE_BUDGET on a laptop would tighten it below what CI can meet;
// run it on CI's numbers instead. "measured" in perf-budget.json holds the CI medians the limits were taken from.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isMainThread,
  parentPort,
  Worker,
  workerData,
} from "node:worker_threads";
import zlib from "node:zlib";

import {
  addPage,
  candidateRoutes,
  mutateFile,
  NEW_PAGE,
} from "../lib/html.mjs";
import { repoRoot } from "../lib/paths.mjs";
import { resolve } from "../lib/resolve.mjs";

const NAME = "perf";
export const BUDGET_FILE = path.join(
  repoRoot,
  "scripts",
  "verify",
  "perf-budget.json",
);

/** route → what it stands for. */
export const PAGES = {
  "/": "home",
  "/posts/proxy-to-built-in-objects": "post",
  "/posts/how-to-check-two-types-are-equal-in-ts": "math",
  "/posts/css-masters-2-week2": "images",
};

export const RUNS = 3;
/**
 * Lighthouse runs at the same time, each in its own worker thread with its own Chromium (Lighthouse keeps global
 * performance marks, so two runs cannot share a thread). Lantern hardly notices the contention on a machine with
 * cores to spare (on a 10-core laptop FCP of the math post moved 903 → 940 ms at 8× the CPU multiplier, 1003 ms at
 * 16×), and two lanes halve the time. A smaller machine (a 4-vCPU CI runner) gets one lane: there the second
 * Chromium's main-thread time ends up in the first one's numbers (WB-review).
 */
const LANES = os.availableParallelism() >= 8 ? 2 : 1;

/** Off-site hosts never requested in the gated run. */
const BLOCKED = [
  "*googletagmanager.com*",
  "*google-analytics.com*",
  "*analytics.google.com*",
  "*doubleclick.net*",
  "*utteranc.es*",
  "*github.com*",
  "*githubusercontent.com*",
];
/** With VERIFY_PERF_THIRD_PARTY: the loaders run, but no hit is sent. */
const BLOCKED_THIRD_PARTY = [
  "*google-analytics.com/g/collect*",
  "*analytics.google.com/g/collect*",
  "*doubleclick.net*",
];

/** metric → direction. "min": the value must be at least the budget, "max": at most. */
export const METRICS = {
  score: "min",
  lcp: "max",
  fcp: "max",
  si: "max",
  tbt: "max",
  cls: "max",
  bytes: "max",
  js: "max",
  css: "max",
  blocking: "max",
};

// ── a GitHub Pages-like server ──────────────────────────────────────────────────────────────────

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};
/** GitHub Pages compresses these (and not images or woff/woff2, which are compressed already). */
const COMPRESSED = new Set([
  ".html",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
  ".txt",
  ".svg",
  ".ico",
  ".ttf",
]);

/** Serve `root` like GitHub Pages: its path resolution, gzip, max-age=600. Resolves to { url, close }. */
export function startPagesServer(root) {
  const gzipped = new Map();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const hit = resolve(root, url.pathname);
    if (hit.status === 301) {
      res.writeHead(301, { location: hit.location + url.search });
      res.end();
      return;
    }
    if (!hit.file) {
      res.writeHead(hit.status, { "content-type": "text/plain" });
      res.end(String(hit.status));
      return;
    }
    const ext = path.extname(hit.file).toLowerCase();
    const headers = {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": "max-age=600",
    };
    let body = fs.readFileSync(hit.file);
    if (
      COMPRESSED.has(ext) &&
      /\bgzip\b/.test(req.headers["accept-encoding"] ?? "")
    ) {
      const key = `${hit.file}:${body.length}`;
      if (!gzipped.has(key)) gzipped.set(key, zlib.gzipSync(body));
      body = gzipped.get(key);
      headers["content-encoding"] = "gzip";
      headers.vary = "Accept-Encoding";
    }
    headers["content-length"] = body.length;
    res.writeHead(hit.status, headers);
    res.end(body);
  });
  return new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      ok({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () =>
          new Promise((done) => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

// ── Lighthouse ──────────────────────────────────────────────────────────────────────────────────

const median = (values) => {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * LCP only goes wrong upwards by noise: when the largest element is a paragraph at the fold, about one run in four
 * lands on Lantern's later paint of the same element (a flat 1.4–2.0 s instead of ~0.65 s, with no change in what
 * loads). A real slowdown moves every run, so the lowest of RUNS stands for the page's LCP.
 */
const lowest = (values) => {
  const finite = values.filter((v) => Number.isFinite(v));
  return finite.length === 0 ? null : Math.min(...finite);
};

/** Chromium for Lighthouse: CHROME_PATH, else the one Playwright installed (the other browser checks use it too). */
async function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { chromium } = await import("playwright");
  return chromium.executablePath();
}

/** Open one headless Chromium for all runs. Returns { run(url, blocked), close() }. */
export async function openLighthouse() {
  const { default: lighthouse } = await import("lighthouse");
  const { launch } = await import("chrome-launcher");
  const chrome = await launch({
    chromePath: await chromePath(),
    chromeFlags: [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--no-first-run",
      "--disable-extensions",
    ],
    logLevel: "silent",
  });
  return {
    async run(url, blocked) {
      const result = await lighthouse(
        url,
        {
          port: chrome.port,
          output: "json",
          logLevel: "error",
          onlyCategories: ["performance"],
          blockedUrlPatterns: blocked,
          disableFullPageScreenshot: true,
        },
        undefined, // the default config: mobile, simulated throttling
      );
      if (!result?.lhr) throw new Error(`lighthouse returned nothing: ${url}`);
      if (result.lhr.runtimeError)
        throw new Error(
          `lighthouse: ${result.lhr.runtimeError.code} ${result.lhr.runtimeError.message}`,
        );
      return { lhr: result.lhr, unusedCss: unusedCss(result.artifacts) };
    },
    close: () => chrome.kill(),
  };
}

/**
 * Unused bytes (uncompressed) of every stylesheet, from the rule coverage Lighthouse gathered. The unused-css-rules
 * audit lists only sheets that waste over 10 KiB transferred, which no sheet of this site does (BaseLayout's is
 * 29 KB, 6 KB gzipped), so the numbers come from the artifacts, merged as lighthouse/core/computed/unused-css.js does.
 */
export function unusedCss(artifacts) {
  const sheets = new Map();
  for (const sheet of artifacts?.Stylesheets ?? [])
    sheets.set(sheet.header.styleSheetId, {
      url: sheet.header.sourceURL,
      total: sheet.content?.length ?? 0,
      used: [],
    });
  for (const rule of artifacts?.CSSUsage ?? [])
    if (rule.used) sheets.get(rule.styleSheetId)?.used.push(rule);
  const out = [];
  for (const sheet of sheets.values()) {
    if (sheet.total === 0) continue;
    let used = 0;
    let end = 0;
    for (const rule of sheet.used.sort(
      (a, b) => a.startOffset - b.startOffset,
    )) {
      if (rule.endOffset <= end) continue;
      used += rule.endOffset - Math.max(rule.startOffset, end);
      end = rule.endOffset;
    }
    out.push({
      url: sheet.url,
      bytes: sheet.total,
      unused: sheet.total - used,
    });
  }
  return out.sort((a, b) => b.unused - a.unused);
}

/** A worker thread that runs Lighthouse for the main thread: { run(url, blocked), close() }. */
function openLane() {
  const worker = new Worker(new URL(import.meta.url), {
    workerData: { perfLane: true },
  });
  let settle = null;
  let crashed = null;
  const finish = (message) => {
    const done = settle;
    settle = null;
    done?.(message);
  };
  worker.on("message", finish);
  worker.on("error", (error) => {
    crashed = String(error?.stack ?? error);
    finish({ error: crashed });
  });
  worker.on("exit", () =>
    finish({ error: crashed ?? "lighthouse lane exited" }),
  );
  const exited = new Promise((done) => worker.once("exit", done));
  return {
    run: (url, blocked) =>
      new Promise((ok, fail) => {
        if (crashed) return fail(new Error(crashed));
        settle = (message) =>
          message.error ? fail(new Error(message.error)) : ok(message.result);
        worker.postMessage({ url, blocked });
      }),
    async close() {
      worker.postMessage(null);
      const timer = setTimeout(() => worker.terminate(), 10_000);
      await exited;
      clearTimeout(timer);
    },
  };
}

// In a lane: one Chromium, one run per message, until the message null.
if (!isMainThread && workerData?.perfLane) {
  const lighthouse = await openLighthouse();
  parentPort.on("message", async (job) => {
    if (job === null) {
      await lighthouse.close();
      parentPort.close();
      return;
    }
    try {
      parentPort.postMessage({
        result: await lighthouse.run(job.url, job.blocked),
      });
    } catch (error) {
      parentPort.postMessage({ error: String(error?.stack ?? error) });
    }
  });
}

const numeric = (lhr, id) => lhr.audits[id]?.numericValue ?? null;

/** The numbers of one Lighthouse run. */
export function summarize({ lhr, unusedCss: sheets }, origin) {
  const requests = lhr.audits["network-requests"]?.details?.items ?? [];
  const byType = {};
  let bytes = 0;
  let thirdParty = 0;
  for (const request of requests) {
    const size = request.transferSize ?? 0;
    bytes += size;
    const type = request.resourceType ?? "Other";
    byType[type] = (byType[type] ?? 0) + size;
    if (!request.url.startsWith(origin)) thirdParty += size;
  }
  const blockingItems =
    lhr.audits["render-blocking-insight"]?.details?.items ?? [];
  return {
    score: Math.round((lhr.categories.performance.score ?? 0) * 100),
    lcp: numeric(lhr, "largest-contentful-paint"),
    fcp: numeric(lhr, "first-contentful-paint"),
    si: numeric(lhr, "speed-index"),
    tbt: numeric(lhr, "total-blocking-time"),
    cls: numeric(lhr, "cumulative-layout-shift"),
    bytes,
    js: byType.Script ?? 0,
    css: byType.Stylesheet ?? 0,
    blocking: blockingItems.length,
    // reported only
    byType,
    thirdPartyBytes: thirdParty,
    requests: requests.length,
    blockingUrls: blockingItems.map((item) => item.url?.replace(origin, "")),
    unusedCss: sheets.map((sheet) => ({
      ...sheet,
      url: sheet.url.startsWith(origin)
        ? sheet.url.slice(origin.length)
        : sheet.url,
    })),
    benchmarkIndex: lhr.environment?.benchmarkIndex ?? null,
  };
}

/**
 * Opportunities and diagnostics of one run, largest estimated saving first: every audit that claims a saving (ms of
 * LCP, FCP or TBT, bytes, CLS), and every insight that did not pass even without one.
 */
export function opportunities(lhr, origin) {
  const list = [];
  for (const [id, audit] of Object.entries(lhr.audits)) {
    const savings = audit.metricSavings ?? {};
    const ms = Math.max(
      0,
      savings.LCP ?? 0,
      savings.FCP ?? 0,
      savings.TBT ?? 0,
    );
    const bytes = audit.details?.overallSavingsBytes ?? 0;
    const cls = savings.CLS ?? 0;
    const failedInsight = id.endsWith("-insight") && audit.score === 0;
    if (ms === 0 && bytes === 0 && cls === 0 && !failedInsight) continue;
    list.push({
      id,
      title: audit.title,
      ms: Math.round(ms),
      bytes: Math.round(bytes),
      ...(cls ? { cls } : {}),
      display: audit.displayValue ?? "",
      items: (audit.details?.items ?? [])
        .slice(0, 5)
        .map((item) =>
          typeof item.url === "string"
            ? item.url.replace(origin, "")
            : (item.entity ?? item.label ?? undefined),
        )
        .filter(Boolean),
    });
  }
  return list.sort((a, b) => b.ms - a.ms || b.bytes - a.bytes);
}

/**
 * Measure `routes` of `site` (a directory, served here, or a URL) RUNS times each, round-robin so that a slow moment
 * spreads over the pages, LANES runs at a time (each lane its own Chromium). → route → { median, runs, … }
 */
export async function measure(
  site,
  routes,
  { blocked = BLOCKED, saveTo = null } = {},
) {
  const server = /^https?:/.test(site)
    ? { url: site.replace(/\/$/, ""), close: async () => {} }
    : await startPagesServer(site);
  const runs = new Map(routes.map((route) => [route, []]));
  const queue = [];
  for (let round = 0; round < RUNS; round += 1) queue.push(...routes);
  const lanes = [];
  try {
    await Promise.all(
      Array.from({ length: Math.min(LANES, queue.length) }, async () => {
        const lighthouse = await openLane();
        lanes.push(lighthouse);
        while (queue.length) {
          const route = queue.shift();
          const result = await lighthouse.run(`${server.url}${route}`, blocked);
          runs
            .get(route)
            .push({ lhr: result.lhr, numbers: summarize(result, server.url) });
        }
      }),
    );
  } finally {
    await Promise.all(lanes.map((lighthouse) => lighthouse.close()));
    await server.close();
  }

  const out = {};
  for (const [route, list] of runs) {
    const medians = {};
    for (const metric of Object.keys(METRICS))
      medians[metric] = (metric === "lcp" ? lowest : median)(
        list.map((run) => run.numbers[metric]),
      );
    // The run whose LCP is the median one stands for the page in the report's opportunities.
    const byLcp = [...list].sort((a, b) => a.numbers.lcp - b.numbers.lcp);
    const middle = byLcp[Math.floor(byLcp.length / 2)];
    out[route] = {
      median: medians,
      runs: list.map((run) => pick(run.numbers, Object.keys(METRICS))),
      byType: middle.numbers.byType,
      requests: middle.numbers.requests,
      thirdPartyBytes: middle.numbers.thirdPartyBytes,
      blockingUrls: middle.numbers.blockingUrls,
      unusedCss: middle.numbers.unusedCss,
      benchmarkIndex: list.map((run) => run.numbers.benchmarkIndex),
      opportunities: opportunities(middle.lhr, server.url),
    };
    // The whole report of that run, for the Lighthouse viewer (googlechrome.github.io/lighthouse/viewer).
    if (saveTo) {
      fs.mkdirSync(saveTo, { recursive: true });
      const file = path.join(saveTo, `${PAGES[route] ?? slug(route)}.json`);
      fs.writeFileSync(file, JSON.stringify(middle.lhr));
      out[route].lhr = path.relative(repoRoot, file);
    }
  }
  return out;
}

const slug = (route) =>
  route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "home";

/**
 * Self-test: write /perf-mutation.js (200 000 pseudo-random letters, so gzip leaves about 120 KB) and load it with a
 * synchronous <script> at the top of <head>. Returns the edited page.
 */
function blockingScript(dir, html) {
  let seed = 1;
  const noise = Array.from({ length: 200_000 }, () => {
    seed = (seed * 48271) % 2147483647;
    return String.fromCharCode(97 + (seed % 26));
  }).join("");
  fs.writeFileSync(
    path.join(dir, "perf-mutation.js"),
    `window.__perfMutation="${noise}";`,
  );
  return html.replace(
    '<meta name="viewport"',
    '<script src="/perf-mutation.js"></script><meta name="viewport"',
  );
}

const pick = (object, keys) =>
  Object.fromEntries(keys.map((key) => [key, object[key]]));

// ── the budget ──────────────────────────────────────────────────────────────────────────────────

export function readBudget(file = BUDGET_FILE) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * The limit a measured value gets: value × (1 + pct/100) + abs, rounded away from the value to a multiple of `round`
 * (down for a "min" metric). `margins` is perf-budget.json "margins": metric → { pct, abs, round }.
 */
export function limitFor(metric, value, margins) {
  const { pct = 0, abs = 0, round = 1 } = margins[metric] ?? {};
  const steps = (x) => Number((x / round).toFixed(6));
  if (METRICS[metric] === "min")
    return Number((Math.floor(steps(value - abs)) * round).toFixed(6));
  const raw = value * (1 + pct / 100) + abs;
  return Number((Math.ceil(steps(raw)) * round).toFixed(6));
}

/** A page's budget entry from its medians. */
export const budgetFrom = (medians, margins) =>
  Object.fromEntries(
    Object.keys(METRICS).map((metric) => [
      metric,
      limitFor(metric, medians[metric], margins),
    ]),
  );

/**
 * VERIFY_PERF_WRITE_BUDGET=1: rewrite perf-budget.json from this run, tightening only. Each limit becomes the
 * stricter of the current one and the one this run's medians give, so a faster page lowers its budget and a slower
 * one cannot raise it (raise a limit by hand, in the PR that explains why). A page without an entry gets a new one.
 */
function ratchet(budget, pages) {
  const next = structuredClone(budget);
  next.pages ??= {};
  next.measured ??= {};
  for (const [route, page] of Object.entries(pages)) {
    const fresh = budgetFrom(page.median, budget.margins ?? {});
    const current = budget.pages?.[route] ?? {};
    next.pages[route] = Object.fromEntries(
      Object.entries(fresh).map(([metric, limit]) => [
        metric,
        current[metric] === undefined
          ? limit
          : METRICS[metric] === "min"
            ? Math.max(limit, current[metric])
            : Math.min(limit, current[metric]),
      ]),
    );
    next.measured[route] = Object.fromEntries(
      Object.entries(page.median).map(([metric, value]) => [
        metric,
        Number(value.toFixed(metric === "cls" ? 4 : 0)),
      ]),
    );
  }
  fs.writeFileSync(BUDGET_FILE, `${JSON.stringify(next, null, 2)}\n`);
}

const show = (metric, value) =>
  value === null
    ? "n/a"
    : metric === "cls"
      ? value.toFixed(3)
      : ["bytes", "js", "css"].includes(metric)
        ? `${(value / 1024).toFixed(1)}KB`
        : ["score", "blocking"].includes(metric)
          ? String(value)
          : `${Math.round(value)}ms`;

/** The loosest limit of each metric over the pages' entries: the budget of a page picked with --route outside PAGES. */
export function loosest(entries) {
  const out = {};
  for (const entry of Object.values(entries))
    for (const [metric, limit] of Object.entries(entry))
      out[metric] =
        out[metric] === undefined
          ? limit
          : METRICS[metric] === "min"
            ? Math.min(out[metric], limit)
            : Math.max(out[metric], limit);
  return Object.keys(out).length ? out : null;
}

/** Problems of one page against its budget entry (empty: within budget). */
export function overBudget(medians, entry) {
  if (!entry) return ["no budget"];
  const problems = [];
  for (const [metric, limit] of Object.entries(entry)) {
    const direction = METRICS[metric];
    if (!direction) {
      problems.push(`unknown metric "${metric}" in the budget`);
      continue;
    }
    const value = medians[metric];
    if (value === null || value === undefined)
      problems.push(`${metric} not measured`);
    else if (direction === "max" ? value > limit : value < limit)
      problems.push(
        `${metric} ${show(metric, value)} ${direction === "max" ? ">" : "<"} ${show(metric, limit)}`,
      );
  }
  return problems;
}

export default {
  name: NAME,
  kind: "browser",
  // Runs after the other browser checks, alone (lib/runner.mjs runChecks).
  exclusive: true,
  scope: "feature",

  async run(ctx) {
    const budget = readBudget();
    const narrowed = (ctx.args?.route ?? []).length > 0;
    const built = candidateRoutes(ctx);
    const routes = narrowed ? built : Object.keys(PAGES);
    const present = routes.filter((route) => built.includes(route));
    const failed = routes
      .filter((route) => !built.includes(route))
      .map((route) => ({ route, detail: "page missing from the build" }));
    const fallback = loosest(budget.pages ?? {});
    let pass = 0;

    const site = ctx.candidateUrl ?? ctx.candidateDir;
    const pages = present.length
      ? await measure(site, present, {
          saveTo: path.join(ctx.reportDir, NAME, "blocked"),
        })
      : {};
    for (const route of present) {
      const problems = overBudget(
        pages[route].median,
        budget.pages?.[route] ?? (PAGES[route] ? null : fallback),
      );
      if (problems.length) failed.push({ route, detail: problems.join(", ") });
      else pass += 1;
    }

    if (process.env.VERIFY_PERF_WRITE_BUDGET === "1")
      ratchet(
        budget,
        Object.fromEntries(
          Object.entries(pages).filter(([route]) => PAGES[route]),
        ),
      );

    let thirdParty;
    if (process.env.VERIFY_PERF_THIRD_PARTY === "1" && present.length)
      thirdParty = await measure(site, present, {
        blocked: BLOCKED_THIRD_PARTY,
        saveTo: path.join(ctx.reportDir, NAME, "third-party"),
      });

    return {
      ok: failed.length === 0,
      pass,

      fail: failed.length,
      failed,
      // No cells: the check measures four pages, not every route, so a route × check grid would show the rest
      // as never examined.
      extra: {
        runs: RUNS,
        pages,
        ...(thirdParty ? { thirdParty } : {}),
      },
    };
  },

  selftest: {
    mutations: [
      {
        // A synchronous script in <head>: one more render-blocking request, ~120 KB more JS gzipped, FCP and LCP
        // later by its download at 1.6 Mbps.
        name: "head 의 큰 blocking script",
        routes: ["/"],
        apply(dir) {
          mutateFile(dir, "index.html", (html) => blockingScript(dir, html));
        },
      },
      {
        // The same on a page only the mutant has: --route measures any page, against the loosest limits.
        name: "기준선에 없는 새 글의 큰 blocking script",
        routes: [NEW_PAGE.route],
        apply(dir) {
          addPage(dir, "posts/proxy-to-built-in-objects.html", (html) =>
            blockingScript(dir, html),
          );
        },
      },
      {
        // A long task on the main thread once the page is parsed: TBT (and the score), a few bytes. A file, not an
        // inline script: the page's CSP allows inline scripts by hash only.
        name: "본문 뒤의 긴 main-thread 작업",
        routes: ["/"],
        apply(dir) {
          fs.writeFileSync(
            path.join(dir, "perf-long-task.js"),
            "const end = performance.now() + 400; while (performance.now() < end);",
          );
          mutateFile(dir, "index.html", (html) =>
            html.replace(
              "</body>",
              '<script type="module" src="/perf-long-task.js"></script></body>',
            ),
          );
        },
      },
    ],
  },
};

// ── command line: the medians of the last run as a Markdown table (the CI job summary) ────────

/** `node scripts/verify/checks/perf.mjs --summary [report]` → Markdown. */
export function summaryMarkdown(report, budget) {
  const columns = [
    "score",
    "lcp",
    "fcp",
    "tbt",
    "cls",
    "si",
    "bytes",
    "js",
    "css",
    "blocking",
  ];
  const lines = [];
  const table = (title, pages, withLimits) => {
    lines.push(`#### ${title}`, "");
    lines.push(`| page | ${columns.join(" | ")} |`);
    lines.push(`|---|${columns.map(() => "---:").join("|")}|`);
    for (const [route, page] of Object.entries(pages)) {
      const limits = budget.pages?.[route] ?? {};
      const cells = columns.map((metric) => {
        const value = show(metric, page.median[metric]);
        return withLimits && limits[metric] !== undefined
          ? `${value} (${METRICS[metric] === "min" ? "≥" : "≤"}${show(metric, limits[metric])})`
          : value;
      });
      lines.push(`| ${PAGES[route] ?? route} | ${cells.join(" | ")} |`);
    }
    lines.push("");
  };
  const extra = report.extra ?? {};
  lines.push(
    `### perf: ${report.ok ? "PASS" : "FAIL"} (Lighthouse mobile, simulated, median of ${extra.runs ?? RUNS})`,
    "",
  );
  if (extra.pages)
    table(
      "third parties blocked (the gate; budget in parentheses)",
      extra.pages,
      true,
    );
  if (extra.thirdParty)
    table("GA and utterances allowed (reported only)", extra.thirdParty, false);
  for (const failure of report.failed ?? [])
    lines.push(`- FAIL ${failure.route}: ${failure.detail}`);
  return lines.join("\n");
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const [
    flag,
    file = path.join(repoRoot, ".verify", "report", `${NAME}.json`),
  ] = process.argv.slice(2);
  if (flag !== "--summary") {
    console.error(
      "usage: node scripts/verify/checks/perf.mjs --summary [report.json]",
    );
    process.exit(2);
  }
  console.log(
    summaryMarkdown(JSON.parse(fs.readFileSync(file, "utf8")), readBudget()),
  );
}
