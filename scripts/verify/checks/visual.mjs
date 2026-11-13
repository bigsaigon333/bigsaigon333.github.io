// visual — full-page screenshots of the candidate must match the baseline, per route and viewport.
//
//   npm run verify -- --only=visual --route=/posts/foo
//   npm run verify -- --only=visual --selector=header        # compare one element instead of the page
//   npm run verify:selftest -- --only=visual --calibrate     # measure rendering noise, write visual.config.json
//
// A failing comparison leaves baseline.png, candidate.png, diff.png and crops of the differing region in
// .verify/report/visual/<route>-<width>/.
//
// visual.config.json holds the viewports and the two tolerances (colorThreshold, maxDiffRatio), both 0:
// two screenshots match when no pixel differs at all. See the comments on the constants below.
//
// An accept entry with "mask" (lib/accept.mjs) paints the elements it selects an opaque fixed colour on both
// sides before the screenshot: the rest of the page must still match.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { paintMasks } from "../lib/accept.mjs";
import {
  mapLimit,
  MAX_PAGES,
  openBrowser,
  openCaptureCache,
  withCaptureCache,
} from "../lib/browser.mjs";
import { editPages, postRoutesWith } from "../lib/html.mjs";
import { repoRoot } from "../lib/paths.mjs";

const NAME = "visual";
const SIDES = ["baseline", "candidate"];
const configFile = fileURLToPath(
  new URL("../visual.config.json", import.meta.url),
);

// Two tolerances, both 0 unless visual.config.json says otherwise. Baseline-vs-baseline captures are
// byte-identical on this machine (measured noise 0), so nothing has to be forgiven.
//
//   maxDiffRatio    share of the pixels that may differ. A floor of 0.05% let a reworded heading and
//                   recoloured code keywords through.
//   colorThreshold  how far apart two colours may be and still count as the same pixel (pixelmatch's
//                   `threshold`, 0–1). At the library default of 0.1 a grey shift of 22–28 levels was "equal":
//                   the tint behind inline code (first seen at 0.055) and the zebra rows of a table (0.025)
//                   could both be switched off unnoticed. 0 means any pixel that is not identical differs.
//
// Raise either only with evidence of irreducible rendering noise (`--calibrate` measures it).
const MIN_DIFF_RATIO = 0;
const STRICTEST_COLOR_THRESHOLD = 0;
const CROP_MAX_HEIGHT = 1200;
const CROP_MARGIN = 16;

// At least one width inside every band the site's media rules (max-width 375px, 600px, 767px) cut out:
//   up to 375 │ 376 … 600 │ 601 … 767 │ 768 and up
//      375    │ 414   600 │    700    │ 768   1280
// With only 375, 768 and 1280 the two middle bands were never drawn, so a rule that applies there alone could
// change freely. 414 is what most phones are. 600 is the last width a "max-width: 600px" rule applies at: a
// rule moved to a narrower breakpoint (420px, say) shows there, while at 414 it still applies on both sides.
const DEFAULT_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 414, height: 896 },
  { width: 600, height: 960 },
  { width: 700, height: 1024 },
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
    if (error.code !== "ENOENT")
      throw new Error(`visual.config.json is unreadable: ${error.message}`);
  }
  const config = {
    maxDiffRatio: stored.maxDiffRatio ?? MIN_DIFF_RATIO,
    colorThreshold: stored.colorThreshold ?? STRICTEST_COLOR_THRESHOLD,
    viewports: stored.viewports ?? DEFAULT_VIEWPORTS,
  };
  for (const name of ["maxDiffRatio", "colorThreshold"]) {
    const value = config[name];
    if (typeof value !== "number" || !(value >= 0 && value <= 1))
      throw new Error(
        `visual.config.json: ${name} must be a number from 0 to 1`,
      );
  }
  if (!Array.isArray(config.viewports) || config.viewports.length === 0)
    throw new Error("visual.config.json: viewports must not be empty");
  return config;
}

const slug = (route) =>
  route.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9._-]+/g, "-") || "index";
const percent = (ratio) => `${(ratio * 100).toFixed(2)}%`;
const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

// ── capturing ───────────────────────────────────────────────────────────────────────────────────

/**
 * PNG of the whole page, or of the first element matching `selector`, with the elements `masks` selects painted
 * over (lib/accept.mjs paintMasks). Throws when the page is not comparable. `onMasked` hears of a mask that painted.
 */
function capture(browser, url, viewport, { route, selector, masks, onMasked }) {
  return browser.withPage(viewport, async (tab) => {
    const status = await tab.open(url);
    if (status >= 400 && route !== "/404") throw new Error(`HTTP ${status}`);
    if (tab.failures.length)
      throw new Error(`third-party request failed: ${tab.failures[0]}`);

    await tab.page.addStyleTag({ content: FREEZE_CSS });
    if ((await paintMasks(tab.page, masks)) > 0) onMasked();

    const options = { animations: "disabled", caret: "hide", scale: "css" };
    if (!selector) return tab.page.screenshot({ ...options, fullPage: true });

    const element = tab.page.locator(selector).first();
    if ((await element.count()) === 0)
      throw new Error(`selector ${selector} not found`);
    return element.screenshot(options);
  });
}

// ── comparing ───────────────────────────────────────────────────────────────────────────────────

/** A copy of `image` on a width × height canvas. The added area is opaque magenta, so it never matches a page. */
function onCanvas(image, width, height) {
  if (image.width === width && image.height === height) return image;
  const canvas = new PNG({ width, height });
  for (let offset = 0; offset < canvas.data.length; offset += 4)
    canvas.data.writeUInt32BE(0xff00ffff, offset);
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
      if (
        data[offset] === 255 &&
        data[offset + 1] === 0 &&
        data[offset + 2] === 0
      ) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        bottom = y;
      }
    }
  }
  return right < 0
    ? null
    : { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/**
 * Every pixel that is not identical in two RGBA buffers of the same size: how many there are, the box around
 * them and the largest difference in one colour channel (0–255).
 */
function exactDifference(a, b, width, height) {
  // Whole pixels are compared as 32-bit words, which needs the bytes to start on a 4-byte boundary.
  const words = (bytes) => {
    const aligned = bytes.byteOffset % 4 === 0 ? bytes : Uint8Array.from(bytes);
    return new Uint32Array(aligned.buffer, aligned.byteOffset, width * height);
  };
  const a32 = words(a);
  const b32 = words(b);
  let count = 0;
  let maxChannelDelta = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0, index = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, index += 1) {
      if (a32[index] === b32[index]) continue;
      count += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      bottom = y;
      for (let channel = index * 4; channel < index * 4 + 4; channel += 1) {
        const delta = Math.abs(a[channel] - b[channel]);
        if (delta > maxChannelDelta) maxChannelDelta = delta;
      }
    }
  }
  return {
    count,
    maxChannelDelta,
    bbox: count
      ? { x: left, y: top, w: right - left + 1, h: bottom - top + 1 }
      : null,
  };
}

/**
 * @returns {{ ok: boolean, ratio: number, differing: number, maxChannelDelta: number, identical: boolean,
 *             sizes: object[], sameSize: boolean, bbox: object|null, images: object|null }}
 */
function compare(baselinePng, candidatePng, { maxDiffRatio, colorThreshold }) {
  const sizeOf = (png) => ({
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  });

  if (baselinePng.equals(candidatePng)) {
    const size = sizeOf(baselinePng);
    return {
      ok: true,
      ratio: 0,
      differing: 0,
      maxChannelDelta: 0,
      identical: true, // the two files are the same bytes
      sizes: [size, size],
      sameSize: true,
      bbox: null,
      images: null,
    };
  }

  const baseline = PNG.sync.read(baselinePng);
  const candidate = PNG.sync.read(candidatePng);
  const sameSize =
    baseline.width === candidate.width && baseline.height === candidate.height;
  const width = Math.max(baseline.width, candidate.width);
  const height = Math.max(baseline.height, candidate.height);
  const before = onCanvas(baseline, width, height).data;
  const after = onCanvas(candidate, width, height).data;

  // Anti-aliased pixels count like any other (includeAA): both sides are drawn by the same browser on the
  // same machine, so an edge that is smoothed differently is a difference in the page, not in the renderer.
  const diff = new PNG({ width, height });
  const beyondThreshold = pixelmatch(before, after, diff.data, width, height, {
    threshold: colorThreshold,
    includeAA: true,
  });
  const exact = exactDifference(before, after, width, height);
  // At threshold 0 the count does not depend on colour arithmetic at all: a pixel is the same or it is not.
  const differing = colorThreshold === 0 ? exact.count : beyondThreshold;
  const ratio = differing / (width * height);

  return {
    ok: sameSize && ratio <= maxDiffRatio,
    ratio,
    differing,
    maxChannelDelta: exact.maxChannelDelta,
    identical: false,
    sizes: [sizeOf(baselinePng), sizeOf(candidatePng)],
    sameSize,
    bbox:
      colorThreshold === 0
        ? exact.bbox
        : beyondThreshold
          ? boundingBox(diff)
          : null,
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
    h: Math.min(
      CROP_MAX_HEIGHT,
      Math.min(diff.height, box.y + box.h + CROP_MARGIN) - y,
    ),
  };

  const cropFile = path.join(dir, "crop.png");
  fs.writeFileSync(cropFile, cropOf(diff, region));
  for (const [name, image] of [
    ["crop-baseline.png", baseline],
    ["crop-candidate.png", candidate],
  ]) {
    const crop = cropOf(image, region);
    if (crop) fs.writeFileSync(path.join(dir, name), crop);
  }
  return path.relative(repoRoot, cropFile);
}

function describe(result, selector) {
  const [baseline, candidate] = result.sizes;
  const box = result.bbox
    ? ` bbox ${result.bbox.x},${result.bbox.y},${result.bbox.w},${result.bbox.h}`
    : "";
  // The pixel count and the largest step in one colour channel (of 255): a faint tint over a large area
  // and a single stray pixel are both 0.00% of a long page.
  if (result.sameSize)
    return `diff ${percent(result.ratio)} (${result.differing} px, max channel Δ${result.maxChannelDelta})${box}`;
  if (selector || baseline.width !== candidate.width) {
    return `size ${baseline.width}x${baseline.height} ≠ ${candidate.width}x${candidate.height}${box}`;
  }
  const delta = candidate.height - baseline.height;
  return `height ${baseline.height} ≠ ${candidate.height} (${delta > 0 ? "+" : ""}${delta})${box}`;
}

// ── the check ───────────────────────────────────────────────────────────────────────────────────

/** What the last run measured; selftest.afterIdentical() turns it into visual.config.json. */
let lastRun = null;

const run = (ctx) => withCaptureCache(ctx, (mode) => runOnce(ctx, mode));

async function runOnce(ctx, cacheMode) {
  const config = readConfig();
  const selector =
    typeof ctx.args.selector === "string" ? ctx.args.selector : null;
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
  let cache;
  try {
    const urls = {
      baseline: await ctx.serve("baseline"),
      candidate: await ctx.serve("candidate"),
    };

    // The baseline's screenshots, kept from an earlier run (lib/browser.mjs openCaptureCache). paintMasks is in
    // lib/accept.mjs: its source decides the pictures too.
    cache = openCaptureCache(ctx, browser, {
      check: NAME,
      sources: [import.meta.url, new URL("../lib/accept.mjs", import.meta.url)],
      mode: cacheMode,
    });
    const idOf = ({ route, viewport }) =>
      `${route}@${viewport.width}x${viewport.height}`;
    const plan = cache.plan(
      jobs.map((job) => ({
        id: idOf(job),
        route: job.route,
        viewport: job.viewport,
        selector,
        masks: ctx.masks(NAME, job.route),
      })),
    );

    /** `cached`: the baseline's picture to use instead of taking it, or null to take it. */
    const attempt = async ({ route, viewport }, previous, cached = null) => {
      const shots = await Promise.all(
        SIDES.map((side) =>
          side === "baseline" && cached
            ? cached
            : capture(browser, urls[side] + route, viewport, {
                route,
                selector,
                masks: ctx.masks(NAME, route),
                onMasked: () => ctx.masked(NAME, route),
              }).catch((error) => new Error(`${side}: ${oneLine(error)}`)),
        ),
      );
      const broken = shots.find((shot) => shot instanceof Error);
      if (broken) return { ok: false, error: broken.message };

      const [baseline, candidate] = shots;
      // The same two pictures as last time give the same answer: no need to decode and compare them again.
      if (
        previous?.pngs?.baseline.equals(baseline) &&
        previous.pngs.candidate.equals(candidate)
      )
        return previous;

      const result = compare(baseline, candidate, config);
      if (result.sameSize) noise = Math.max(noise, result.ratio);
      return { ...result, pngs: { baseline, candidate } };
    };

    outcomes = await mapLimit(jobs, MAX_PAGES, async (job) => {
      const id = idOf(job);
      const entry = plan.get(id);
      const useCached = entry.cached && !entry.spot ? entry.cached : null;
      let result = await attempt(job, undefined, useCached);
      const first = result.pngs?.baseline ?? null;
      // Guard b: a hit taken fresh anyway must come out the same.
      if (entry.spot && first && !first.equals(entry.cached))
        cache.mismatch(id, "spot check: a fresh capture differs");
      let attempts = 1;
      if (!result.ok) {
        // Flake guard: a difference has to show up twice before it counts. The second look always takes both
        // pictures fresh, so a cached baseline can neither cause nor hide a failure (guard a).
        result = await attempt(job, result);
        attempts = 2;
        const fresh = result.pngs?.baseline;
        if (entry.cached && fresh && !fresh.equals(entry.cached))
          cache.mismatch(id, "a fresh capture after a failure differs");
      }
      // A picture taken now is kept when nothing suggests it was a bad one: it passed, or a second capture came out
      // the same.
      if (
        !entry.cached &&
        first &&
        (attempts === 1 || result.pngs?.baseline.equals(first))
      )
        cache.store(id, first);

      const { route, viewport } = job;
      const outcome = { route, width: viewport.width, ok: result.ok, attempts };
      if (result.error)
        return { ...outcome, detail: `${viewport.width}: ${result.error}` };

      const [baseline, candidate] = result.sizes;
      Object.assign(outcome, {
        ratio: result.ratio,
        differing: result.differing,
        maxChannelDelta: result.maxChannelDelta,
        identical: result.identical,
        sameSize: result.sameSize,
        baseline,
        candidate,
      });
      if (result.ok) return outcome;

      const crop = writeEvidence(
        path.join(reportRoot, `${slug(route)}-${viewport.width}`),
        result.pngs,
        result,
      );
      return {
        ...outcome,
        bbox: result.bbox,
        detail: `${viewport.width}: ${describe(result, selector)} → ${crop}`,
      };
    });
  } finally {
    await browser.close();
  }

  const failed = outcomes
    .filter((outcome) => !outcome.ok)
    .map(({ route, detail }) => ({ route, detail }));
  for (const { route } of failed) cells[route] = "fail";
  const flaky = outcomes.filter(
    (outcome) => outcome.ok && outcome.attempts > 1,
  );
  lastRun = {
    noise,
    // Noise is only a meaningful number when every full-page comparison produced one.
    measurable:
      !selector &&
      outcomes.length > 0 &&
      outcomes.every((outcome) => outcome.sameSize),
    colorThreshold: config.colorThreshold,
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
      colorThreshold: config.colorThreshold,
      viewports: config.viewports,
      selector,
      noise,
      // Comparisons whose two pictures are the same file, byte for byte. The rest passed within the tolerances.
      identical: outcomes.filter((outcome) => outcome.identical).length,
      flaky: flaky.map(({ route, width }) => `${route}@${width}`), // passed, but only on the second look
      comparisons: outcomes,
      allowed,
      cache: cache.stats,
    },
  };
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────────

function edit(file, pattern, replacement) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(pattern, replacement);
  if (after === before)
    throw new Error(`mutation did not apply: ${pattern} not found in ${file}`);
  fs.writeFileSync(file, after);
}

export default {
  name: NAME,
  kind: "browser",
  run,

  selftest: {
    // `routes` names a page the mutation shows on: that page is compared at every viewport instead of all pages.
    mutations: [
      {
        name: "스타일시트의 CSS 값 변경",
        routes: (dir) => postRoutesWith(dir, /<pre>/),
        apply(dir) {
          // The background of code blocks. Same layout, different pixels: only the pixel comparison can notice.
          editPages(dir, /background:#272822/g, "background:#14506e");
        },
      },
      {
        name: "글에서 문단 하나 삭제",
        routes: ["/posts/proxy-to-built-in-objects"],
        apply(dir) {
          const post = path.join(
            dir,
            "posts",
            "proxy-to-built-in-objects.html",
          );
          edit(post, /(<main[^>]*>[\s\S]*?)<p>[\s\S]*?<\/p>/, "$1");
        },
      },

      // Faint colours. Both were "equal" at pixelmatch's default colour threshold of 0.1.
      {
        name: "문장 안 code 의 옅은 배경색 끄기",
        routes: (dir) => postRoutesWith(dir, /<p>[^<]*<code>/),
        apply(dir) {
          editPages(
            dir,
            /(:not\(pre\)>code\{[^}]*?)background:#ffe56433/,
            "$1background:transparent",
          );
        },
      },
      {
        name: "표 짝수 줄의 옅은 배경색 끄기",
        routes: (dir) => postRoutesWith(dir, /<table/),
        apply(dir) {
          editPages(
            dir,
            /(tr:nth-child\(2n\)\{)background-color:#f6f8fa/,
            "$1background-color:transparent",
          );
        },
      },

      // Media rules between the phone and the tablet widths. The first shows at 414 and 600 only, the second
      // at 600 only (a rule narrowed to 420px still applies at 414): neither at 375, 768 or 1280.
      {
        name: "600px 미디어 규칙의 값 변경 (글 제목 2rem → 5rem)",
        routes: ["/"],
        apply(dir) {
          editPages(
            dir,
            /(@media \(max-width:600px\)\{article\[[^\]]*\] h2\[[^\]]*\]\{font-size:)2rem/,
            "$15rem",
          );
        },
      },
      {
        name: "600px 미디어 규칙의 경계 변경 (600px → 420px)",
        routes: ["/"],
        apply(dir) {
          editPages(
            dir,
            /@media \(max-width:600px\)/g,
            "@media (max-width:420px)",
          );
        },
      },
      {
        // Shows at 700 only: 768 and 1280 are outside the rule, 600 and below inside it either way.
        name: "767px 미디어 규칙의 경계 변경 (767px → 620px)",
        routes: ["/"],
        apply(dir) {
          editPages(
            dir,
            /@media \(max-width:767px\)/g,
            "@media (max-width:620px)",
          );
        },
      },
    ],

    /**
     * Baseline against itself differs only by rendering noise: the tolerance is derived from it. The noise is
     * counted at the colour threshold of the config, which calibration never loosens by itself.
     */
    async afterIdentical(ctx) {
      if (!ctx.args.calibrate || !lastRun?.measurable) return;
      const measuredNoise = Math.ceil(lastRun.noise * 1e6) / 1e6;
      const config = {
        colorThreshold: lastRun.colorThreshold,
        maxDiffRatio: Math.max(measuredNoise * 2, MIN_DIFF_RATIO),
        measuredNoise,
        viewports: lastRun.viewports,
      };
      fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
    },
  },
};
