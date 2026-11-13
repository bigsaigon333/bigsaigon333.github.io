// S8.1: prerendered vs on-demand pages, a JSON API endpoint, a cookie round-trip.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const marker = (html, name) => {
  const found = html.match(new RegExp(`data-${name}="([^"]+)"`));
  assert.ok(found, `no data-${name}="…" in the page`);
  return found[1];
};

const json = async (response) => {
  assert.match(
    response.headers.get("content-type") ?? "",
    /^application\/json/,
    "content-type is not JSON",
  );
  return response.json();
};

const postItem = (request, body, contentType = "application/json") =>
  request("/s81/api/items", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

export const cases = [
  {
    name: "prerendered page is a file in dist/client, served byte for byte",
    async run({ request, dist }) {
      const file = path.join(dist, "client", "s81", "static", "index.html");
      assert.ok(fs.existsSync(file), `${file} was not written at build time`);
      const onDisk = fs.readFileSync(file, "utf8");
      const first = await (await request("/s81/static/")).text();
      const second = await (await request("/s81/static/")).text();
      assert.equal(first, onDisk, "the served page is not the built file");
      assert.equal(second, first, "two requests got different pages");
      marker(onDisk, "rendered-at");
    },
  },
  {
    name: "on-demand page has no file in dist/client and differs per request",
    async run({ request, dist }) {
      const client = path.join(dist, "client", "s81", "dynamic");
      assert.ok(!fs.existsSync(client), `${client} exists: it was prerendered`);
      const a = await request("/s81/dynamic/?name=astro");
      const b = await request("/s81/dynamic/?name=lab");
      assert.equal(a.status, 200);
      const [htmlA, htmlB] = [await a.text(), await b.text()];
      assert.notEqual(
        marker(htmlA, "request-id"),
        marker(htmlB, "request-id"),
        "the request id did not change between requests",
      );
      assert.equal(marker(htmlA, "name"), "astro");
      assert.equal(marker(htmlB, "name"), "lab");
    },
  },
  {
    name: "GET /s81/api/items lists items as JSON; unknown id is 404",
    async run({ request }) {
      const list = await request("/s81/api/items");
      assert.equal(list.status, 200);
      const body = await json(list);
      assert.ok(Array.isArray(body.items), "items is not an array");
      const missing = await request("/s81/api/items?id=does-not-exist");
      assert.equal(missing.status, 404);
      assert.equal((await json(missing)).error, "not found");
    },
  },
  {
    name: "POST /s81/api/items creates (201 + Location) and GET finds it",
    async run({ request }) {
      const created = await postItem(request, { name: "  first item " });
      assert.equal(created.status, 201);
      const item = await json(created);
      assert.equal(item.name, "first item", "the name was not trimmed");
      assert.equal(
        created.headers.get("location"),
        `/s81/api/items?id=${item.id}`,
      );
      const found = await request(created.headers.get("location"));
      assert.equal(found.status, 200);
      assert.deepEqual(await json(found), item);
    },
  },
  {
    name: "POST validation: bad JSON 400, invalid name 400, wrong type 415",
    async run({ request }) {
      const broken = await postItem(request, "{not json");
      assert.equal(broken.status, 400);
      assert.equal((await json(broken)).error, "body is not valid JSON");

      for (const body of [
        {},
        { name: "" },
        { name: 42 },
        { name: "x".repeat(41) },
      ]) {
        const invalid = await postItem(request, body);
        assert.equal(
          invalid.status,
          400,
          `${JSON.stringify(body)} was accepted`,
        );
        assert.match((await json(invalid)).error, /^name must be/);
      }

      const xml = await postItem(request, "<name/>", "application/xml");
      assert.equal(xml.status, 415);
    },
  },
  {
    name: "cookie round-trip: HttpOnly SameSite=Strict counter, cleared by DELETE",
    async run({ request }) {
      const first = await request("/s81/api/visits");
      assert.equal((await json(first)).visits, 1);
      const setCookie = first.headers.get("set-cookie") ?? "";
      assert.match(setCookie, /^s81-visits=1;/);
      assert.match(setCookie, /; HttpOnly/i);
      assert.match(setCookie, /; SameSite=Strict/i);
      assert.match(setCookie, /; Path=\/s81/i);

      const cookie = setCookie.split(";")[0];
      const second = await request("/s81/api/visits", { headers: { cookie } });
      assert.equal((await json(second)).visits, 2);
      assert.match(second.headers.get("set-cookie") ?? "", /^s81-visits=2;/);

      const cleared = await request("/s81/api/visits", {
        method: "DELETE",
        headers: { cookie },
      });
      assert.equal(cleared.status, 204);
      assert.match(
        cleared.headers.get("set-cookie") ?? "",
        /^s81-visits=deleted;.*Expires=Thu, 01 Jan 1970/i,
      );
    },
  },
  {
    name: "browser: the HttpOnly cookie is sent back but hidden from document.cookie",
    async run({ base, browser }) {
      const context = await (await browser()).newContext();
      try {
        const page = await context.newPage();
        await page.goto(`${base}/s81/api/visits`);
        await page.goto(`${base}/s81/api/visits`);
        assert.equal(
          JSON.parse(await page.locator("body").innerText()).visits,
          2,
          "the browser did not send the cookie back",
        );
        await page.goto(`${base}/s81/dynamic/`);
        const visible = await page.evaluate(() => document.cookie);
        assert.doesNotMatch(visible, /s81-visits/, "page script can read it");
        // Path=/s81: a lookup by the origin URL ("/") would not match it.
        const [stored] = await context.cookies(`${base}/s81/`);
        assert.equal(stored?.httpOnly, true);
        assert.equal(stored?.sameSite, "Strict");
      } finally {
        await context.close();
      }
    },
  },
];
