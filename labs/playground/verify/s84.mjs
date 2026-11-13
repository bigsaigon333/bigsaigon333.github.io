// S8.4: middleware (locals + timing header), config/dynamic redirects, rewrites, scoped i18n with
// a fallback, and paginate().
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const marker = (html, name) => {
  const found = html.match(new RegExp(`data-${name}="([^"]*)"`));
  assert.ok(found, `no data-${name}="…" in the page`);
  return found[1];
};

const page = async (request, pathname) => {
  const res = await request(pathname);
  assert.equal(res.status, 200, `${pathname} answered ${res.status}`);
  return { res, html: await res.text() };
};

export const cases = [
  {
    name: "middleware: locals reach the page, timing + request id headers are set",
    async run({ request }) {
      const a = await page(request, "/s84/locals");
      const b = await page(request, "/s84/locals");
      const id = a.res.headers.get("x-s84-request-id");
      assert.match(id ?? "", /^[0-9a-f-]{36}$/, "no x-s84-request-id header");
      assert.equal(marker(a.html, "request-id"), id, "locals ≠ header");
      assert.notEqual(b.res.headers.get("x-s84-request-id"), id);
      assert.match(
        a.res.headers.get("server-timing") ?? "",
        /^s84;dur=\d+(\.\d+)?$/,
        "no Server-Timing: s84;dur=…",
      );
      assert.equal(marker(a.html, "greeting"), "set by middleware");
    },
  },
  {
    name: "middleware is scoped: other demos get no s84 headers",
    async run({ request }) {
      const res = await request("/s81/dynamic/");
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("x-s84-request-id"), null);
      assert.equal(res.headers.get("server-timing"), null);
    },
  },
  {
    name: "config redirects: plain 301, object form 302, dynamic params kept",
    async run({ request }) {
      const plain = await request("/s84/old");
      assert.equal(plain.status, 301);
      assert.equal(plain.headers.get("location"), "/s84/new");
      const moved = await request("/s84/moved");
      assert.equal(moved.status, 302);
      assert.equal(moved.headers.get("location"), "/s84/new");
      const legacy = await request("/s84/legacy/2");
      assert.equal(legacy.status, 301);
      assert.equal(legacy.headers.get("location"), "/s84/posts/2");
    },
  },
  {
    name: "dynamic redirect: Astro.redirect with 307 / 303, 400 without a target",
    async run({ request }) {
      const temp = await request("/s84/go?to=new");
      assert.equal(temp.status, 307);
      assert.equal(temp.headers.get("location"), "/s84/new");
      const seeOther = await request("/s84/go?to=posts");
      assert.equal(seeOther.status, 303);
      assert.equal(seeOther.headers.get("location"), "/s84/posts/1");
      const bad = await request("/s84/go?to=elsewhere");
      assert.equal(bad.status, 400);
      assert.equal(bad.headers.get("location"), null);
    },
  },
  {
    name: "rewrites: Astro.rewrite and middleware rewrite keep the URL, serve other content",
    async run({ request }) {
      const target = await page(request, "/s84/new");
      assert.equal(marker(target.html, "page"), "new");
      const alias = await page(request, "/s84/alias");
      assert.equal(alias.res.headers.get("location"), null);
      assert.equal(marker(alias.html, "page"), "new");
      // Astro.url follows the rewrite target; originPathname keeps what the browser asked for.
      assert.equal(marker(alias.html, "url"), "/s84/new");
      // originPathname comes back with the slash that trailingSlash/format adds ("/s84/alias/").
      assert.match(marker(alias.html, "origin"), /^\/s84\/alias\/?$/);
      // next(url) in middleware: no second middleware pass, so locals and header still match.
      const who = await page(request, "/s84/whoami");
      assert.equal(who.res.headers.get("location"), null);
      assert.equal(marker(who.html, "page"), "locals");
      assert.match(marker(who.html, "origin"), /^\/s84\/whoami\/?$/);
      assert.equal(
        marker(who.html, "request-id"),
        who.res.headers.get("x-s84-request-id"),
      );
    },
  },
  {
    name: "i18n: en unprefixed, ko under /ko, links from astro:i18n",
    async run({ request }) {
      const en = await page(request, "/s84/i18n/hello");
      assert.equal(marker(en.html, "locale"), "en");
      assert.equal(marker(en.html, "text"), "Hello");
      // trailingSlash "ignore" + build.format "directory": the helper appends a slash.
      assert.equal(marker(en.html, "other-locale-url"), "/ko/s84/i18n/hello/");
      const ko = await page(request, "/ko/s84/i18n/hello");
      assert.equal(marker(ko.html, "locale"), "ko");
      assert.equal(marker(ko.html, "text"), "안녕하세요");
      assert.equal(marker(ko.html, "other-locale-url"), "/s84/i18n/hello/");
    },
  },
  {
    name: "i18n fallback: a missing ko page is rewritten to en (URL kept), unknown stays 404",
    async run({ request }) {
      const fb = await page(request, "/ko/s84/i18n/about");
      assert.equal(marker(fb.html, "page"), "about");
      assert.equal(marker(fb.html, "locale"), "en", "content is not en");
      assert.equal(marker(fb.html, "requested-locale"), "ko");
      assert.equal(fb.res.headers.get("x-s84-fallback"), "ko->en");
      const missing = await request("/ko/s84/i18n/nothing-here");
      assert.equal(missing.status, 404);
    },
  },
  {
    name: "i18n is scoped: no /ko copies of other demos (global fallback would make them)",
    async run({ request, dist }) {
      assert.ok(!fs.existsSync(path.join(dist, "client", "ko", "s81")));
      const res = await request("/ko/s81/dynamic/");
      assert.equal(res.status, 404);
    },
  },
  {
    name: "paginate: 3 pages of 3, prev/next links, 404 past the end",
    async run({ request, dist }) {
      const file = path.join(dist, "client", "s84", "posts", "2", "index.html");
      assert.ok(fs.existsSync(file), "pages are not prerendered");
      const pages = [];
      for (const n of [1, 2, 3])
        pages.push((await page(request, `/s84/posts/${n}`)).html);
      const items = pages.map((html) =>
        [...html.matchAll(/data-item="([^"]+)"/g)].map((m) => m[1]),
      );
      assert.deepEqual(items, [
        ["post-1", "post-2", "post-3"],
        ["post-4", "post-5", "post-6"],
        ["post-7"],
      ]);
      assert.equal(marker(pages[0], "prev"), "none");
      assert.equal(marker(pages[0], "next"), "/s84/posts/2");
      assert.equal(marker(pages[1], "prev"), "/s84/posts/1");
      assert.equal(marker(pages[1], "next"), "/s84/posts/3");
      assert.equal(marker(pages[2], "next"), "none");
      assert.equal(marker(pages[2], "total"), "7");
      assert.equal((await request("/s84/posts/4")).status, 404);
    },
  },
];
