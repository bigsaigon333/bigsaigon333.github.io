// S8.5: Astro 7 features — route cache (memoryCache + routeRules), the logger handler API, a live
// collection over a local JSON file, and a dev toolbar app (in `astro dev`, best effort).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const run = Math.random().toString(36).slice(2, 8);

const marker = (html, name) => {
  const found = html.match(new RegExp(`data-${name}="([^"]*)"`));
  assert.ok(found, `no data-${name}="…" in the page`);
  return found[1];
};

const options = (html) =>
  JSON.parse(marker(html, "cache-options").replaceAll("&quot;", '"'));

const get = async (request, pathname) => {
  const res = await request(pathname);
  return {
    status: res.status,
    cache: res.headers.get("x-astro-cache"),
    cdn: res.headers.get("cdn-cache-control"),
    tags: res.headers.get("cache-tag"),
    lastModified: res.headers.get("last-modified"),
    html: await res.text(),
  };
};

const postJson = (request, pathname, body, method = "POST") =>
  request(pathname, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

export const cases = [
  {
    name: "cache: Astro.cache.set() → MISS, then HIT with the same body; CDN headers are stripped",
    async run({ request }) {
      const url = `/s85/cache/page/?run=${run}`;
      const first = await get(request, url);
      assert.equal(first.status, 200);
      assert.equal(first.cache, "MISS");
      // memoryCache() reads CDN-Cache-Control/Cache-Tag, then Astro strips them from the response.
      assert.equal(first.cdn, null);
      assert.equal(first.tags, null);
      assert.equal(marker(first.html, "cache-enabled"), "true");
      assert.deepEqual(options(first.html), { maxAge: 60, tags: ["s85-page"] });
      const second = await get(request, url);
      assert.equal(second.cache, "HIT");
      assert.equal(
        marker(second.html, "render-id"),
        marker(first.html, "render-id"),
        "a HIT rendered the page again",
      );
      const other = await get(request, `/s85/cache/page/?run=${run}-other`);
      assert.equal(other.cache, "MISS", "the query string is not in the key");
    },
  },
  {
    name: "cache: routeRules caches a page that never calls cache.set()",
    async run({ request }) {
      const url = `/s85/cache/rule/plain/?run=${run}`;
      const first = await get(request, url);
      assert.equal(first.cache, "MISS");
      assert.deepEqual(options(first.html), { maxAge: 60, tags: ["s85-rule"] });
      const second = await get(request, url);
      assert.equal(second.cache, "HIT");
      assert.equal(
        marker(second.html, "render-id"),
        marker(first.html, "render-id"),
      );
    },
  },
  {
    name: "cache: a route call merges over the rule (maxAge replaced, tags accumulate); set(false) opts out",
    async run({ request }) {
      const merged = `/s85/cache/rule/override/?run=${run}`;
      const first = await get(request, merged);
      assert.equal(first.cache, "MISS");
      assert.deepEqual(options(first.html), {
        maxAge: 1,
        tags: ["s85-rule", "s85-override"],
      });
      // Both tags reach the provider: either one drops the entry.
      for (const tag of ["s85-rule", "s85-override"]) {
        assert.equal((await get(request, merged)).cache, "HIT");
        await postJson(request, "/s85/cache/invalidate", { tags: [tag] });
        assert.equal(
          (await get(request, merged)).cache,
          "MISS",
          `tag ${tag} was not stored`,
        );
      }
      // maxAge 1 replaced the rule's 60: expired (no swr) → MISS again.
      await sleep(1_300);
      assert.equal(
        (await get(request, merged)).cache,
        "MISS",
        "the rule's maxAge 60 won",
      );

      const url = `/s85/cache/rule/off/?run=${run}`;
      const a = await get(request, url);
      const b = await get(request, url);
      assert.equal(a.cache, null, "set(false) still went through the cache");
      assert.equal(a.cdn, null);
      assert.notEqual(marker(a.html, "render-id"), marker(b.html, "render-id"));
    },
  },
  {
    name: "cache: swr serves STALE after maxAge, revalidates in the background, then HIT with a new render",
    async run({ request }) {
      const url = `/s85/cache/swr/?run=${run}`;
      const first = await get(request, url);
      assert.equal(first.cache, "MISS");
      assert.deepEqual(options(first.html), { maxAge: 1, swr: 30, tags: [] });
      await sleep(1_300);
      const stale = await get(request, url);
      assert.equal(stale.cache, "STALE");
      assert.equal(
        marker(stale.html, "render-id"),
        marker(first.html, "render-id"),
      );
      await sleep(200);
      const fresh = await get(request, url);
      assert.equal(fresh.cache, "HIT");
      assert.notEqual(
        marker(fresh.html, "render-id"),
        marker(first.html, "render-id"),
        "the background revalidation did not store a new render",
      );
    },
  },
  {
    name: "cache: invalidate by tag and by exact path drops the entry (next GET is a MISS)",
    async run({ request }) {
      const url = `/s85/cache/page/?run=${run}-inv`;
      const first = await get(request, url);
      assert.equal((await get(request, url)).cache, "HIT");
      const byTag = await postJson(request, "/s85/cache/invalidate", {
        tags: ["s85-page"],
      });
      assert.equal(byTag.status, 204);
      const afterTag = await get(request, url);
      assert.equal(afterTag.cache, "MISS");
      assert.notEqual(
        marker(afterTag.html, "render-id"),
        marker(first.html, "render-id"),
      );

      const rule = `/s85/cache/rule/plain/?run=${run}-inv`;
      await get(request, rule);
      assert.equal((await get(request, rule)).cache, "HIT");
      const wrongPath = await postJson(request, "/s85/cache/invalidate", {
        path: "/s85/cache/rule/",
      });
      assert.equal(wrongPath.status, 204);
      assert.equal(
        (await get(request, rule)).cache,
        "HIT",
        "path invalidation is not exact-match",
      );
      await postJson(request, "/s85/cache/invalidate", {
        path: `/s85/cache/rule/plain/?run=${run}-inv`,
      });
      assert.equal((await get(request, rule)).cache, "MISS");
    },
  },
  {
    name: "cache: POST is never cached",
    async run({ request }) {
      const url = `/s85/cache/rule/plain/?run=${run}-post`;
      const res = await request(url, { method: "POST" });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-astro-cache"), null);
      assert.equal(
        (await get(request, url)).cache,
        "MISS",
        "the POST filled the cache",
      );
    },
  },
  {
    name: "logger: context.logger reaches the configured handler; level 'warn' drops info",
    async run({ request }) {
      const token = `tok-${run}`;
      const logged = await postJson(request, "/s85/logger", { token });
      assert.equal(logged.status, 204);
      const res = await request(`/s85/logger?token=${token}`);
      assert.equal(res.status, 200);
      const { entries } = await res.json();
      const levels = entries.map((entry) => entry.level).sort();
      assert.deepEqual(
        levels,
        ["error", "warn"],
        `recorded ${JSON.stringify(entries)}`,
      );
      for (const entry of entries)
        assert.match(entry.message, new RegExp(token));
    },
  },
  {
    name: "logger + cache: a Set-Cookie response is not cached and the cache warns through the logger",
    async run({ request }) {
      const url = `/s85/cache/rule/cookie/?run=${run}`;
      const a = await get(request, url);
      const b = await get(request, url);
      assert.equal(a.cache, null);
      assert.equal(b.cache, null);
      const res = await request(
        `/s85/logger?token=${encodeURIComponent(`/s85/cache/rule/cookie/?run=${run}`)}`,
      );
      const { entries } = await res.json();
      assert.ok(
        entries.some(
          (entry) =>
            entry.level === "warn" &&
            /Skipping cache .*Set-Cookie/.test(entry.message),
        ),
        `no cache warning in ${JSON.stringify(entries)}`,
      );
    },
  },
  {
    name: "live collection: getLiveCollection reads the JSON file on every request (no rebuild)",
    async run({ request }) {
      const id = `note-${run}`;
      const before = await get(request, "/s85/live/");
      assert.equal(before.status, 200);
      assert.doesNotMatch(before.html, new RegExp(`data-note-id="${id}"`));
      const created = await postJson(request, "/s85/live/api", {
        id,
        title: "First",
        tag: "lab",
      });
      assert.equal(created.status, 201);
      const after = await get(request, "/s85/live/");
      assert.match(after.html, new RegExp(`data-note-id="${id}"`));
      assert.equal(
        Number(marker(after.html, "count")),
        Number(marker(before.html, "count")) + 1,
      );
      const filtered = await get(request, "/s85/live/?tag=nope");
      assert.equal(
        marker(filtered.html, "count"),
        "0",
        "the collection filter was ignored",
      );
      const removed = await request(`/s85/live/api?id=${id}`, {
        method: "DELETE",
      });
      assert.equal(removed.status, 204);
      assert.doesNotMatch(
        (await get(request, "/s85/live/")).html,
        new RegExp(`data-note-id="${id}"`),
      );
    },
  },
  {
    name: "live entry: cacheHint → cache tags + Last-Modified, HIT until the write invalidates its tag",
    async run({ request }) {
      const id = `entry-${run}`;
      await postJson(request, "/s85/live/api", {
        id,
        title: "Before",
        tag: "lab",
      });
      const first = await get(request, `/s85/live/${id}/`);
      assert.equal(first.status, 200);
      assert.equal(first.cache, "MISS");
      assert.equal(marker(first.html, "title"), "Before");
      assert.deepEqual(options(first.html).tags, [`s85-note-${id}`]);
      assert.ok(
        first.lastModified,
        "no Last-Modified from cacheHint.lastModified",
      );
      assert.equal((await get(request, `/s85/live/${id}/`)).cache, "HIT");
      await postJson(request, "/s85/live/api", {
        id,
        title: "After",
        tag: "lab",
      });
      const updated = await get(request, `/s85/live/${id}/`);
      assert.equal(updated.cache, "MISS");
      assert.equal(marker(updated.html, "title"), "After");
    },
  },
  {
    name: "live entry: unknown id is LiveEntryNotFoundError (404), bad data is LiveCollectionValidationError",
    async run({ request }) {
      const missing = await get(request, `/s85/live/missing-${run}/`);
      assert.equal(missing.status, 404);
      assert.equal(marker(missing.html, "error"), "LiveEntryNotFoundError");
      const id = `bad-${run}`;
      const raw = await postJson(request, "/s85/live/api", {
        id,
        title: "",
        tag: "lab",
        raw: true,
      });
      assert.equal(raw.status, 201);
      const invalid = await get(request, `/s85/live/${id}/`);
      assert.equal(invalid.status, 500);
      assert.equal(
        marker(invalid.html, "error"),
        "LiveCollectionValidationError",
      );
      assert.equal(invalid.cache, null, "an error page was cached");
    },
  },
  {
    name: "dev toolbar (astro dev, best effort): the app registers, inits and round-trips to the server; cache is off in dev",
    async run({ browser }) {
      const port = await freePort();
      const dev = spawn(
        path.join(root, "node_modules", ".bin", "astro"),
        // --ignore-lock keeps it a foreground child: when Astro 7 detects an agent it starts
        // a background server instead, which outlives the case and holds .astro/dev.json.
        ["dev", "--ignore-lock", "--host", "127.0.0.1", "--port", String(port)],
        {
          cwd: root,
          env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let log = "";
      dev.stdout.on("data", (chunk) => (log += chunk));
      dev.stderr.on("data", (chunk) => (log += chunk));
      const base = `http://127.0.0.1:${port}`;
      const context = await (await browser()).newContext();
      try {
        const deadline = Date.now() + 15_000;
        for (;;) {
          try {
            await fetch(base, { redirect: "manual" });
            break;
          } catch {
            if (Date.now() > deadline || dev.exitCode !== null)
              throw new Error(`astro dev did not start\n${log}`);
            await sleep(150);
          }
        }
        const res = await fetch(`${base}/s85/cache/page/`);
        const html = await res.text();
        assert.equal(
          res.headers.get("x-astro-cache"),
          null,
          "cache ran in dev",
        );
        assert.equal(marker(html, "cache-enabled"), "false");

        const page = await context.newPage();
        await page.goto(`${base}/s85/cache/page/`);
        await page
          .locator('astro-dev-toolbar [data-app-id="s85-lab"]')
          .first()
          .waitFor({ state: "attached" });
        const text = await page.waitForFunction(
          () => {
            const toolbar = document.querySelector("astro-dev-toolbar");
            const canvas = toolbar?.shadowRoot?.querySelector(
              'astro-dev-toolbar-app-canvas[data-app-id="s85-lab"]',
            );
            const out = canvas?.shadowRoot?.querySelector("[data-s85-pong]");
            return out?.textContent || false;
          },
          null,
          { timeout: 15_000 },
        );
        assert.match(
          await text.jsonValue(),
          /^pong from server, initialized \d+$/,
        );
      } finally {
        await context.close();
        dev.kill();
      }
    },
  },
];
