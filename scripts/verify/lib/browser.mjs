// Headless Chromium for the browser checks (visual, embeds).
//
//   const browser = await openBrowser(ctx);
//   await browser.withPage({ width: 1280, height: 900 }, async (tab) => {
//     const status = await tab.open(url);   // navigate, then wait until the page has stopped changing
//     tab.page                              // the Playwright page
//     tab.failures                          // third-party requests that could not be served
//   });
//   await browser.close();
//
// Determinism comes from three things: fixed context options, request routing (trackers blocked,
// third-party responses recorded once into ctx.cacheDir and replayed), and a settle wait that is
// driven by conditions rather than by sleeping.
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Never requested: they would make runs depend on the network and count visits. */
const BLOCKED_HOSTS = [
  "utteranc.es",
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
];

export const MAX_PAGES = 4;
/** A page settles in well under a second, even on a busy machine. This only bounds one that never does. */
const SETTLE_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

const matchesHost = (hostname, domain) =>
  hostname === domain || hostname.endsWith(`.${domain}`);

// ── recorded third-party responses ──────────────────────────────────────────────────────────────

/** file → Promise<{ status, contentType, body }>. One disk read or download per URL and process. */
const responses = new Map();

function readRecorded(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof raw.status !== "number" || typeof raw.body !== "string")
      return null;
    return {
      status: raw.status,
      contentType: raw.contentType || "application/octet-stream",
      body: Buffer.from(raw.body, "base64"),
    };
  } catch {
    return null; // missing or unreadable: record it again
  }
}

/** Other agents write to the same directory, so a file is only ever published whole. */
function writeRecorded(file, url, entry) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  const data = {
    url,
    status: entry.status,
    contentType: entry.contentType,
    body: entry.body.toString("base64"),
  };
  fs.writeFileSync(temp, JSON.stringify(data));
  try {
    // link() refuses to replace an existing file: whoever recorded first wins and everyone replays the same bytes.
    fs.linkSync(temp, file);
    return entry;
  } catch (error) {
    if (error.code === "EEXIST") {
      const winner = readRecorded(file);
      if (winner) return winner;
    }
    fs.renameSync(temp, file);
    return entry;
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

async function download(url, headers) {
  let failure;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
      const response = await fetch(url, {
        headers,
        redirect: "follow",
        signal,
      });
      if (!response.ok) {
        failure = new Error(`HTTP ${response.status}`);
        if (response.status < 500) break; // the answer will not change by asking again
        continue;
      }
      return {
        status: response.status,
        contentType:
          response.headers.get("content-type") || "application/octet-stream",
        body: Buffer.from(await response.arrayBuffer()),
      };
    } catch (error) {
      failure = new Error(
        error.cause?.code ?? error.cause?.message ?? error.message,
      );
    }
  }
  throw failure;
}

function recorded(cacheDir, url, headers) {
  const file = path.join(
    cacheDir,
    `${createHash("sha256").update(url).digest("hex")}.json`,
  );
  if (!responses.has(file)) {
    const pending = (async () =>
      readRecorded(file) ??
      writeRecorded(file, url, await download(url, headers)))();
    // A failure is neither stored on disk nor remembered: the next request tries again.
    pending.catch(() => responses.delete(file));
    responses.set(file, pending);
  }
  return responses.get(file);
}

// ── request routing ─────────────────────────────────────────────────────────────────────────────

async function routeRequest(route, { cacheDir, localOrigins, failures }) {
  const request = route.request();
  const url = new URL(request.url());

  if (BLOCKED_HOSTS.some((domain) => matchesHost(url.hostname, domain)))
    return route.abort("blockedbyclient");
  if (localOrigins.has(url.origin) || !/^https?:$/.test(url.protocol))
    return route.continue();
  if (request.method() !== "GET") return route.abort("blockedbyclient");

  let entry;
  try {
    const sent = request.headers();
    // The same headers the browser would send, so that e.g. Google Fonts answers with woff2.
    const headers = Object.fromEntries(
      ["user-agent", "accept", "accept-language"]
        .filter((name) => sent[name])
        .map((name) => [name, sent[name]]),
    );
    entry = await recorded(cacheDir, request.url(), headers);
  } catch (error) {
    failures.push(`${request.url()} (${error.message})`);
    return route.abort("failed");
  }

  return route.fulfill({
    status: entry.status,
    headers: {
      "content-type": entry.contentType,
      "access-control-allow-origin": "*", // fonts and integrity-checked stylesheets are fetched in CORS mode
      "cache-control": "no-store",
    },
    body: entry.body,
  });
}

// ── settling ────────────────────────────────────────────────────────────────────────────────────

/**
 * One round, run inside the page: fonts loaded, every image loaded and decoded, main thread idle, a frame
 * produced. Resolves to true when the DOM changed while waiting.
 */
async function settleRound() {
  const key = "__verifySettle";
  if (!window[key]) {
    window[key] = { mutations: 0 };
    new MutationObserver((records) => {
      window[key].mutations += records.length;
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  }
  const before = window[key].mutations;

  // A full-page screenshot shows the whole page, so nothing may wait for a scroll that never happens.
  for (const lazy of document.querySelectorAll(
    'img[loading="lazy"], iframe[loading="lazy"]',
  ))
    lazy.loading = "eager";

  void document.documentElement.scrollHeight; // layout decides which web fonts are needed
  await document.fonts.ready;
  await Promise.all(
    Array.from(document.images, (image) =>
      image.complete
        ? image.decode().catch(() => {})
        : new Promise((done) => {
            image.addEventListener("load", done, { once: true });
            image.addEventListener("error", done, { once: true });
          }),
    ),
  );
  await new Promise((done) =>
    requestIdleCallback(() => requestAnimationFrame(() => done()), {
      timeout: 5000,
    }),
  );

  return window[key].mutations !== before;
}

const describePending = (pending) => {
  const urls = [...pending].map((request) => request.url());
  return urls.length
    ? `${urls.length} pending: ${urls.slice(0, 3).join(", ")}`
    : "page keeps changing";
};

/**
 * Wait until the page has stopped changing: loaded, fonts ready, images complete, no request in flight and
 * no DOM mutation across two consecutive rounds. Throws when that does not happen within `timeout` of `since`.
 */
async function settle(page, net, timeout, since = Date.now()) {
  const deadline = since + timeout;
  const remaining = () => Math.max(1, deadline - Date.now());
  const expired = () =>
    new Error(
      `did not settle within ${timeout / 1000}s (${describePending(net.pending)})`,
    );

  await page.waitForLoadState("load", { timeout: remaining() }).catch(() => {
    throw expired();
  });

  let quietRounds = 0;
  while (quietRounds < 2) {
    if (Date.now() >= deadline) throw expired();
    const startedBefore = net.started;
    let timer;
    const changed = await Promise.race([
      page.evaluate(settleRound).catch((error) => {
        // The document was replaced under us (redirect, reload): look again. Anything else is a real failure.
        if (/context was destroyed|navigat/i.test(error.message)) return true;
        throw error;
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(expired()), remaining());
      }),
    ]).finally(() => clearTimeout(timer));
    const quiet =
      !changed && net.pending.size === 0 && net.started === startedBefore;
    quietRounds = quiet ? quietRounds + 1 : 0;
  }
}

// ── browser ─────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} ctx                    verification context (uses ctx.serve and ctx.cacheDir)
 * @param {object} [options]
 * @param {number} [options.maxPages]     pages open at the same time
 */
export async function openBrowser(ctx, { maxPages = MAX_PAGES } = {}) {
  const localOrigins = new Set();
  for (const side of ["baseline", "candidate"])
    localOrigins.add(new URL(await ctx.serve(side)).origin);

  // Loaded here rather than at the top: every check module is imported even when only static checks run.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  const contexts = new Map();

  const contextFor = ({ width, height }) => {
    const key = `${width}x${height}`;
    if (!contexts.has(key)) {
      contexts.set(
        key,
        browser.newContext({
          viewport: { width, height },
          deviceScaleFactor: 1,
          locale: "ko-KR",
          timezoneId: "Asia/Seoul",
          reducedMotion: "reduce",
          colorScheme: "light",
          serviceWorkers: "block",
        }),
      );
    }
    return contexts.get(key);
  };

  let open = 0;
  const waiting = [];
  const acquire = () => {
    if (open < maxPages) {
      open += 1;
      return Promise.resolve();
    }
    return new Promise((ready) => waiting.push(ready));
  };
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else open -= 1;
  };

  return {
    /** Run `fn(tab)` with a fresh page of the given viewport. At most `maxPages` run at once. */
    async withPage(viewport, fn) {
      await acquire();
      let page;
      try {
        const context = await contextFor(viewport);
        page = await context.newPage();

        const net = { pending: new Set(), started: 0 };
        const failures = [];
        page.on("request", (request) => {
          net.pending.add(request);
          net.started += 1;
        });
        page.on("requestfinished", (request) => net.pending.delete(request));
        page.on("requestfailed", (request) => net.pending.delete(request));
        await page.route("**/*", (route) =>
          routeRequest(route, {
            cacheDir: ctx.cacheDir,
            localOrigins,
            failures,
          }).catch((error) => {
            // Answering a request of a page that has gone away fails, and does not matter.
            if (!page.isClosed())
              failures.push(
                `${route.request().url()} (${error.message.split("\n")[0]})`,
              );
          }),
        );

        return await fn({
          page,
          /** Requests that could not be answered, as "url (reason)". A page with any of these is not comparable. */
          failures,
          /** Navigate and settle, within `timeout` overall. Returns the HTTP status of the document. */
          async open(url, { timeout = SETTLE_TIMEOUT_MS } = {}) {
            const since = Date.now();
            const response = await page.goto(url, {
              waitUntil: "load",
              timeout,
            });
            await settle(page, net, timeout, since);
            return response ? response.status() : 0;
          },
          /** Settle again, after something that may have changed the page. */
          settle: ({ timeout = SETTLE_TIMEOUT_MS } = {}) =>
            settle(page, net, timeout),
        });
      } finally {
        await page?.close().catch(() => {});
        release();
      }
    },

    async close() {
      await browser.close();
    },
  };
}

/** Run `worker` over `items`, at most `limit` at a time, keeping the order of the results. */
export async function mapLimit(items, limit, worker) {
  const results = Array.from({ length: items.length });
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await worker(items[index], index);
      }
    },
  );
  await Promise.all(lanes);
  return results;
}
