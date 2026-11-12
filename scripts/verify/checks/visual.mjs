// visual — full-page screenshots of the candidate must match the baseline, per route and viewport.
//
//   npm run verify -- --only=visual --route=/posts/foo
//   npm run verify -- --only=visual --selector=header        # compare one element instead of the page
//   npm run verify:selftest -- --only=visual --calibrate     # measure rendering noise, write visual.config.json
//
// A failing comparison leaves baseline.png, candidate.png, diff.png and crops of the differing region in
// .verify/report/visual/<route>-<width>/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { mapLimit, MAX_PAGES, openBrowser } from "../lib/browser.mjs";
import { repoRoot } from "../lib/paths.mjs";

const NAME = "visual";
const SIDES = ["baseline", "candidate"];
const configFile = fileURLToPath(new URL("../visual.config.json", import.meta.url));

/** The smallest tolerance calibration will ever write: 0.05% of the pixels. */
const MIN_DIFF_RATIO = 0.0005;
const PIXEL_THRESHOLD = 0.1;
const CROP_MAX_HEIGHT = 1200;
const CROP_MARGIN = 16;

const DEFAULT_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
];

// Animations and transitions jump to their end state, the caret never blinks.
const FREEZE_CSS = `*, *::before, *::after {
  animation-delay: 0s !important;
  animation-duration: 0s !important;
  animation-iteration-count: 1 !important;
  transition-delay: 0s !important;
  transition-duration: 0s !important;
  caret-color: transparent !important;
  scroll-behavior: auto !important;
}`;

function readConfig() {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(configFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`visual.config.json is unreadable: ${error.message}`);
  }
  return {
    maxDiffRatio: stored.maxDiffRatio ?? MIN_DIFF_RATIO,
    viewports: stored.viewports ?? DEFAULT_VIEWPORTS,
  };
}

const slug = (route) => route.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "index";
const percent = (ratio) => `${(ratio * 100).toFixed(2)}%`;
const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

// ── capturing ───────────────────────────────────────────────────────────────────────────────────

/** PNG of the whole page, or of the first element matching `selector`. Throws when the page is not comparable. */
function capture(browser, url, viewport, { route, selector }) {
  return browser.withPage(viewport, async (tab) => {
    const status = await tab.open(url);
    if (status >= 400 && route !== "/404") throw new Error(`HTTP ${status}`);
    if (tab.failures.length) throw new Error(`third-party request failed: ${tab.failures[0]}`);

    await tab.page.addStyleTag({ content: FREEZE_CSS });

    const options = { animations: "disabled", caret: "hide", scale: "css" };
    if (!selector) return tab.page.screenshot({ ...options, fullPage: true });

    const element = tab.page.locator(selector).first();
    if ((await element.count()) === 0) throw new Error(`selector ${selector} not found`);
    return element.screenshot(options);
  });
}

// ── comparing ───────────────────────────────────────────────────────────────────────────────────

/** A copy of `image` on a width × height canvas. The added area is opaque magenta, so it never matches a page. */
function onCanvas(image, width, height) {
  if (image.width === width && image.height === height) return image;
  const canvas = new PNG({ width, height });
  for (let offset = 0; offset < canvas.data.length; offset += 4) canvas.data.writeUInt32BE(0xff00ffff, offset);
  PNG.bitblt(image, canvas, 0, 0, image.width, image.height, 0, 0);
  return canvas;
}

/** Bounding box of the pixels pixelmatch painted as different (pure red; everything else is grey or yellow). */
function boundingBox(diff) {
  const { width, height, data } = diff;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += 4) {
      if (data[offset] === 255 && data[offset + 1] === 0 && data[offset + 2] === 0) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return right < 0 ? null : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/**
 * @returns {{ ok: boolean, ratio: number, sizes: object[], sameSize: boolean, bbox: object|null, images: object|null }}
 */
function compare(baselinePng, candidatePng, maxDiffRatio) {
  const sizeOf = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

  if (baselinePng.equals(candidatePng)) {
    const size = sizeOf(baselinePng);
    return { ok: true, ratio: 0, sizes: [size, size], sameSize: true, bbox: null, images: null };
  }

  const baseline = PNG.sync.read(baselinePng);
  const candidate = PNG.sync.read(candidatePng);
  const sameSize = baseline.width === candidate.width && baseline.height === candidate.height;
  const width = Math.max(baseline.width, candidate.width);
  const height = Math.max(baseline.height, candidate.height);

  const diff = new PNG({ width, height });
  const differing = pixelmatch(
    onCanvas(baseline, width, height).data,
    onCanvas(candidate, width, height).data,
    diff.data,
    width,
    height,
    { threshold: PIXEL_THRESHOLD },
  );
  const ratio = differing / (width * height);

  return {
    ok: sameSize && ratio <= maxDiffRatio,
    ratio,
    sizes: [sizeOf(baselinePng), sizeOf(candidatePng)],
    sameSize,
    bbox: differing ? boundingBox(diff) : null,
    images: { baseline, candidate, diff },
  };
}

// ── reporting ───────────────────────────────────────────────────────────────────────────────────

// One fixed row filter instead of trying all five per row: four times faster for files a quarter larger.
const encode = (image) => PNG.sync.write(image, { filterType: 1 });

function cropOf(image, box) {
  const width = Math.min(box.w, image.width - box.x);
  const height = Math.min(box.h, image.height - box.y);
  if (width <= 0 || height <= 0) return null; // the region lies outside the shorter page
  const out = new PNG({ width, height });
  PNG.bitblt(image, out, box.x, box.y, width, height, 0, 0);
  return encode(out);
}

/** Write the evidence for one failed comparison and return the path of the crop, relative to the repository. */
function writeEvidence(dir, pngs, result) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "baseline.png"), pngs.baseline);
  fs.writeFileSync(path.join(dir, "candidate.png"), pngs.candidate);
  fs.writeFileSync(path.join(dir, "diff.png"), encode(result.images.diff));

  const { diff, baseline, candidate } = result.images;
  const box = result.bbox ?? { x: 0, y: 0, w: diff.width, h: diff.height };
  const x = Math.max(0, box.x - CROP_MARGIN);
  const y = Math.max(0, box.y - CROP_MARGIN);
  const region = {
    x,
    y,
    w: Math.min(diff.width, box.x + box.w + CROP_MARGIN) - x,
    h: Math.min(CROP_MAX_HEIGHT, Math.min(diff.height, box.y + box.h + CROP_MARGIN) - y),
  };

  const cropFile = path.join(dir, "crop.png");
  fs.writeFileSync(cropFile, cropOf(diff, region));
  for (const [name, image] of [["crop-baseline.png", baseline], ["crop-candidate.png", candidate]]) {
    const crop = cropOf(image, region);
    if (crop) fs.writeFileSync(path.join(dir, name), crop);
  }
  return path.relative(repoRoot, cropFile);
}

function describe(result, selector) {
  const [baseline, candidate] = result.sizes;
  const box = result.bbox ? ` bbox ${result.bbox.x},${result.bbox.y},${result.bbox.w},${result.bbox.h}` : "";
  if (result.sameSize) return `diff ${percent(result.ratio)}${box}`;
  if (selector || baseline.width !== candidate.width) {
    return `size ${baseline.width}x${baseline.height} ≠ ${candidate.width}x${candidate.height}${box}`;
  }
  const delta = candidate.height - baseline.height;
  return `height ${baseline.height} ≠ ${candidate.height} (${delta > 0 ? "+" : ""}${delta})${box}`;
}

// ── the check ───────────────────────────────────────────────────────────────────────────────────

/** What the last run measured; selftest.afterIdentical() turns it into visual.config.json. */
let lastRun = null;

async function run(ctx) {
  const config = readConfig();
  const selector = typeof ctx.args.selector === "string" ? ctx.args.selector : null;
  const reportRoot = path.join(ctx.reportDir, NAME);
  fs.rmSync(reportRoot, { recursive: true, force: true });

  const cells = {};
  const allowed = [];
  const jobs = [];
  for (const route of ctx.routes) {
    const reason = ctx.allowed(NAME, `route:${route}`);
    if (reason) {
      cells[route] = "skip";
      allowed.push({ item: `route:${route}`, reason });
      continue;
    }
    cells[route] = "pass";
    for (const viewport of config.viewports) jobs.push({ route, viewport });
  }

  let noise = 0; // largest difference ratio between two same-sized captures, over every attempt
  const browser = await openBrowser(ctx);
  let outcomes;
  try {
    const urls = { baseline: await ctx.serve("baseline"), candidate: await ctx.serve("candidate") };

    const attempt = async ({ route, viewport }, previous) => {
      const shots = await Promise.all(
        SIDES.map((side) =>
          capture(browser, urls[side] + route, viewport, { route, selector }).catch(
            (error) => new Error(`${side}: ${oneLine(error)}`),
          ),
        ),
      );
      const broken = shots.find((shot) => shot instanceof Error);
      if (broken) return { ok: false, error: broken.message };

      const [baseline, candidate] = shots;
      // The same two pictures as last time give the same answer: no need to decode and compare them again.
      if (previous?.pngs?.baseline.equals(baseline) && previous.pngs.candidate.equals(candidate)) return previous;

      const result = compare(baseline, candidate, config.maxDiffRatio);
      if (result.sameSize) noise = Math.max(noise, result.ratio);
      return { ...result, pngs: { baseline, candidate } };
    };

    outcomes = await mapLimit(jobs, MAX_PAGES, async (job) => {
      let result = await attempt(job);
      let attempts = 1;
      if (!result.ok) {
        // Flake guard: a difference has to show up twice before it counts.
        result = await attempt(job, result);
        attempts = 2;
      }

      const { route, viewport } = job;
      const outcome = { route, width: viewport.width, ok: result.ok, attempts };
      if (result.error) return { ...outcome, detail: `${viewport.width}: ${result.error}` };

      const [baseline, candidate] = result.sizes;
      Object.assign(outcome, { ratio: result.ratio, sameSize: result.sameSize, baseline, candidate });
      if (result.ok) return outcome;

      const crop = writeEvidence(path.join(reportRoot, `${slug(route)}-${viewport.width}`), result.pngs, result);
      return { ...outcome, bbox: result.bbox, detail: `${viewport.width}: ${describe(result, selector)} → ${crop}` };
    });
  } finally {
    await browser.close();
  }

  const failed = outcomes.filter((outcome) => !outcome.ok).map(({ route, detail }) => ({ route, detail }));
  for (const { route } of failed) cells[route] = "fail";
  const flaky = outcomes.filter((outcome) => outcome.ok && outcome.attempts > 1);
  lastRun = {
    noise,
    // Noise is only a meaningful number when every full-page comparison produced one.
    measurable: !selector && outcomes.length > 0 && outcomes.every((outcome) => outcome.sameSize),
    viewports: config.viewports,
  };

  return {
    ok: failed.length === 0,
    pass: outcomes.length - failed.length,
    fail: failed.length,
    failed,
    cells,
    extra: {
      maxDiffRatio: config.maxDiffRatio,
      viewports: config.viewports,
      selector,
      noise,
      flaky: flaky.map(({ route, width }) => `${route}@${width}`), // passed, but only on the second look
      comparisons: outcomes,
      allowed,
    },
  };
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────────

function edit(file, pattern, replacement) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`mutation did not apply: ${pattern} not found in ${file}`);
  fs.writeFileSync(file, after);
}

export default {
  name: NAME,
  kind: "browser",
  run,

  selftest: {
    mutations: [
      {
        name: "스타일시트의 CSS 값 변경",
        apply(dir) {
          const cssDir = path.join(dir, "_next", "static", "css");
          const [stylesheet] = fs.readdirSync(cssDir).filter((file) => file.endsWith(".css"));
          // The background of code blocks. Same layout, different pixels: only the pixel comparison can notice.
          edit(path.join(cssDir, stylesheet), "background:#272822", "background:#14506e");
        },
      },
      {
        name: "글에서 문단 하나 삭제",
        apply(dir) {
          // Inside the post body, which React leaves alone when it hydrates. Anywhere else the baseline's own
          // JavaScript would put the paragraph back from __NEXT_DATA__ before the screenshot is taken.
          const post = path.join(dir, "posts", "proxy-to-built-in-objects.html");
          edit(post, /(<main[^>]*>[\s\S]*?)<p>[\s\S]*?<\/p>/, "$1");
        },
      },
    ],

    /** Baseline against itself differs only by rendering noise: the tolerance is derived from it. */
    async afterIdentical(ctx) {
      if (!ctx.args.calibrate || !lastRun?.measurable) return;
      const measuredNoise = Math.ceil(lastRun.noise * 1e6) / 1e6;
      const config = {
        maxDiffRatio: Math.max(measuredNoise * 2, MIN_DIFF_RATIO),
        measuredNoise,
        viewports: lastRun.viewports,
      };
      fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    },
  },
};
