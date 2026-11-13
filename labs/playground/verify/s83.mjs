// S8.3: a prerendered shell with a server:defer island (fallback first, per-request content) and
// Preact client islands whose client:* directives hydrate at different times.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const builtPage = (dist, ...segments) => {
  const file = path.join(dist, "client", "s83", ...segments, "index.html");
  assert.ok(fs.existsSync(file), `${file} was not prerendered`);
  return fs.readFileSync(file, "utf8");
};

// The island URL is baked into the prerendered page as a <link rel="preload" as="fetch">.
const islandUrl = (html) => {
  const found = html.match(
    /<link rel="preload" as="fetch" href="([^"]*\/_server-islands\/[^"]+)"/,
  );
  assert.ok(found, "no preload link to /_server-islands/ in the page");
  return found[1].replaceAll("&amp;", "&");
};

const marker = (html, name) => {
  const found = html.match(new RegExp(`data-${name}="([^"]+)"`));
  assert.ok(found, `no data-${name}="…" in the HTML`);
  return found[1];
};

// Opens a page and records every script request; the caller closes the context.
async function openPage(browser, base, pathname, viewport) {
  const context = await (await browser()).newContext({ viewport });
  const page = await context.newPage();
  const scripts = [];
  page.on("request", (req) => {
    if (req.resourceType() === "script") scripts.push(req.url());
  });
  await page.goto(`${base}${pathname}`, { waitUntil: "load" });
  return { context, page, scripts };
}

const hydrated = (page, name) =>
  page.locator(`[data-s83-counter="${name}"]`).getAttribute("data-hydrated");

export const cases = [
  {
    name: "shell is prerendered: fallback in the file, island content not, props encrypted in a GET URL",
    async run({ dist }) {
      const html = builtPage(dist);
      assert.match(
        html,
        /data-s83-fallback/,
        "the fallback is not in the shell",
      );
      assert.doesNotMatch(html, /data-s83-island-id/, "island content leaked");
      const url = new URL(islandUrl(html), "http://x");
      assert.equal(url.pathname, "/_server-islands/Stamp");
      assert.ok(url.searchParams.get("p"), "props were not sent (p is empty)");
      assert.doesNotMatch(url.search, /from-the-shell/, "props are plain text");
      assert.ok(
        !fs.existsSync(path.join(dist, "client", "_server-islands")),
        "the island route was prerendered",
      );
    },
  },
  {
    name: "the island route renders on demand: two GETs, two ids; a forged export is 400",
    async run({ request, dist }) {
      const url = islandUrl(builtPage(dist));
      const [a, b] = [await request(url), await request(url)];
      assert.equal(a.status, 200);
      assert.match(a.headers.get("content-type") ?? "", /^text\/html/);
      assert.equal(a.headers.get("x-robots-tag"), "noindex");
      const [htmlA, htmlB] = [await a.text(), await b.text()];
      assert.notEqual(
        marker(htmlA, "s83-island-id"),
        marker(htmlB, "s83-island-id"),
        "the island did not change between requests",
      );
      assert.equal(marker(htmlA, "s83-label"), "from-the-shell");
      // Inside the island, Astro.url is the island route, not the page that asked for it.
      assert.equal(marker(htmlA, "s83-route"), "/_server-islands/Stamp");
      assert.doesNotMatch(
        htmlA,
        /<html/,
        "the island is a fragment, not a page",
      );
      const forged = await request(url.replace(/e=[^&]+/, "e=forged"));
      assert.equal(forged.status, 400, "an export that does not decrypt");
    },
  },
  {
    name: "browser: the fallback shows first, then the island replaces it; each load differs",
    async run({ base, browser }) {
      const context = await (await browser()).newContext();
      try {
        const page = await context.newPage();
        let release;
        const gate = new Promise((resolve) => (release = resolve));
        await page.route("**/_server-islands/**", async (route) => {
          await gate;
          await route.continue();
        });
        await page.goto(`${base}/s83/`, { waitUntil: "load" });
        const fallback = page.locator("[data-s83-fallback]");
        const island = page.locator("[data-s83-island-id]");
        assert.equal(await fallback.count(), 1, "no fallback while waiting");
        assert.equal(await island.count(), 0, "island before its response");
        release();
        await island.waitFor();
        assert.equal(await fallback.count(), 0, "fallback was not removed");
        const first = await island.getAttribute("data-s83-island-id");
        await page.unroute("**/_server-islands/**");
        await page.reload();
        await island.waitFor();
        const second = await island.getAttribute("data-s83-island-id");
        assert.notEqual(first, second, "a reload showed the same island");
      } finally {
        await context.close();
      }
    },
  },
  {
    name: "browser: client:load and client:idle hydrate on load, client:visible only after scroll",
    async run({ base, browser }) {
      const { context, page, scripts } = await openPage(
        browser,
        base,
        "/s83/",
        {
          width: 1200,
          height: 700,
        },
      );
      try {
        await page.waitForSelector(
          '[data-s83-counter="load"][data-hydrated="yes"]',
        );
        await page.waitForSelector(
          '[data-s83-counter="idle"][data-hydrated="yes"]',
        );
        await page.waitForTimeout(300);
        assert.equal(
          await hydrated(page, "visible"),
          "no",
          "visible hydrated early",
        );
        assert.ok(
          !scripts.some((url) => /Later/.test(url)),
          `Later.tsx was fetched before scroll: ${scripts.join(", ")}`,
        );
        await page
          .locator('[data-s83-counter="visible"]')
          .scrollIntoViewIfNeeded();
        await page.waitForSelector(
          '[data-s83-counter="visible"][data-hydrated="yes"]',
        );
        assert.ok(
          scripts.some((url) => /Later/.test(url)),
          "Later.tsx never loaded",
        );
        const button = page.locator('[data-s83-counter="visible"] button');
        await button.click();
        assert.equal(await button.innerText(), "1");
      } finally {
        await context.close();
      }
    },
  },
  {
    name: "browser: client:media waits for its query; no directive never hydrates",
    async run({ base, browser }) {
      const { context, page } = await openPage(browser, base, "/s83/", {
        width: 1200,
        height: 700,
      });
      try {
        await page.waitForSelector(
          '[data-s83-counter="load"][data-hydrated="yes"]',
        );
        await page.waitForTimeout(300);
        assert.equal(
          await hydrated(page, "media"),
          "no",
          "media hydrated wide",
        );
        await page.setViewportSize({ width: 500, height: 700 });
        await page.waitForSelector(
          '[data-s83-counter="media"][data-hydrated="yes"]',
        );

        const none = page.locator('[data-s83-counter="none"]');
        assert.equal(await hydrated(page, "none"), "no");
        await none.locator("button").click();
        assert.equal(
          await none.locator("button").innerText(),
          "0",
          "it reacted",
        );
        assert.equal(
          await none.evaluate((el) => el.closest("astro-island")),
          null,
          "a directive-less component is wrapped in <astro-island>",
        );
      } finally {
        await context.close();
      }
    },
  },
  {
    name: "a page of directive-less Preact components ships zero JS",
    async run({ base, browser, dist }) {
      const html = builtPage(dist, "static");
      assert.match(
        html,
        /data-s83-counter="static-a"/,
        "component not rendered",
      );
      assert.doesNotMatch(html, /<script/, "the page has a <script>");
      assert.doesNotMatch(html, /astro-island/, "the page has an island");
      const { context, scripts } = await openPage(
        browser,
        base,
        "/s83/static/",
      );
      try {
        assert.deepEqual(scripts, [], "the browser requested scripts");
      } finally {
        await context.close();
      }
    },
  },
];
