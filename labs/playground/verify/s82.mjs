// S8.2: an Action with zod validation (HTML form without JS, client call with JS, RPC), and a
// session-backed visit counter + cart that persists for one cookie and is isolated per client.
import assert from "node:assert/strict";

const FORM = "/s82/subscribe/";
const CART = "/s82/cart/";
const COOKIE = "s82-session";

const marker = (html, name) => {
  const found = html.match(new RegExp(`data-${name}="([^"]*)"`));
  assert.ok(found, `no data-${name}="…" in the page`);
  return found[1];
};

// The form's action attribute, e.g. "?_action=s82.subscribe" (decoded from HTML).
const formAction = (html, id) => {
  const form = html.match(new RegExp(`<form[^>]*id="${id}"[^>]*>`));
  assert.ok(form, `no <form id="${id}">`);
  const action = form[0].match(/action="([^"]+)"/);
  assert.ok(action, `<form id="${id}"> has no action`);
  return action[1].replaceAll("&amp;", "&");
};

const post = (request, path, fields, headers = {}) =>
  request(path, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams(fields).toString(),
  });

const sessionCookie = (response) => {
  const header = response.headers.get("set-cookie") ?? "";
  const found = header.match(new RegExp(`${COOKIE}=[^;]+`));
  assert.ok(found, `no ${COOKIE} cookie in Set-Cookie: ${header || "(none)"}`);
  return { cookie: found[0], header };
};

const cartOf = (html) => JSON.parse(decodeURIComponent(marker(html, "cart")));

// Cart page action URLs (addToCart, clearCart) read from a fresh render.
const cartActions = async (request, cookie) => {
  const html = await (await request(CART, { headers: { cookie } })).text();
  return {
    add: CART + formAction(html, "s82-add"),
    clear: CART + formAction(html, "s82-clear"),
  };
};

export const cases = [
  {
    name: "form without JS: valid POST renders the action result in the page",
    async run({ request }) {
      const page = await request(FORM);
      assert.equal(page.status, 200);
      const action = formAction(await page.text(), "s82-subscribe");
      assert.equal(action, "?_action=s82.subscribe");
      const res = await post(request, FORM + action, {
        name: "Astro",
        email: "astro@example.com",
        age: "21",
      });
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.equal(marker(html, "result"), "Welcome Astro (21)");
      assert.doesNotMatch(html, /data-error-for=/, "errors were rendered");
    },
  },
  {
    name: "form without JS: invalid POST is 400 with one message per bad field",
    async run({ request }) {
      const res = await post(request, `${FORM}?_action=s82.subscribe`, {
        name: "A",
        email: "not-an-email",
        age: "",
      });
      assert.equal(res.status, 400);
      const html = await res.text();
      for (const field of ["name", "email", "age"]) {
        assert.match(
          html,
          new RegExp(`data-error-for="${field}"`),
          `no error for ${field}`,
        );
      }
      assert.doesNotMatch(html, /data-result=/, "a result was rendered");
      // The submitted values are put back so the visitor can fix them.
      assert.match(html, /value="not-an-email"/);
    },
  },
  {
    name: "RPC /_actions/s82.subscribe: devalue data on success, fields on 400",
    async run({ request }) {
      const ok = await post(request, "/_actions/s82.subscribe", {
        name: "Lab",
        email: "lab@example.com",
        age: "30",
      });
      assert.equal(ok.status, 200);
      assert.match(ok.headers.get("content-type") ?? "", /json\+devalue/);
      assert.match(await ok.text(), /Welcome Lab \(30\)/);

      const bad = await post(request, "/_actions/s82.subscribe", {
        name: "Lab",
        email: "lab@example.com",
        age: "7",
      });
      assert.equal(bad.status, 400);
      const body = await bad.json();
      assert.equal(body.type, "AstroActionInputError");
      assert.deepEqual(Object.keys(body.fields), ["age"]);
    },
  },
  {
    name: "a cross-site form POST is rejected with 403 (checkOrigin), same-site runs",
    async run({ base, request }) {
      const send = (headers) =>
        post(
          request,
          `${FORM}?_action=s82.subscribe`,
          { name: "Evil", email: "evil@example.com", age: "40" },
          headers,
        );
      assert.equal(
        (await send({ origin: "https://evil.example" })).status,
        403,
      );
      assert.equal(
        (await send({ "sec-fetch-site": "cross-site" })).status,
        403,
      );
      // Without security.allowedDomains the server ignores the Host header and its own origin is
      // http://localhost:<port>, so even the origin we connected to counts as another site.
      assert.equal((await send({ origin: base })).status, 403);
      // Browsers send Sec-Fetch-Site, which is checked before Origin.
      const same = await send({
        origin: base,
        "sec-fetch-site": "same-origin",
      });
      assert.equal(same.status, 200);
      assert.equal(marker(await same.text(), "result"), "Welcome Evil (40)");
    },
  },
  {
    name: "session: HttpOnly cookie; visits persist across requests for one cookie",
    async run({ request }) {
      const first = await request(CART);
      assert.equal(first.status, 200);
      const { cookie, header } = sessionCookie(first);
      assert.match(header, /HttpOnly/i);
      assert.match(header, /SameSite=Lax/i);
      assert.equal(marker(await first.text(), "visits"), "1");
      for (const expected of ["2", "3"]) {
        const next = await request(CART, { headers: { cookie } });
        assert.equal(marker(await next.text(), "visits"), expected);
      }
      // Without the cookie the server starts a new session.
      const fresh = await request(CART);
      assert.equal(marker(await fresh.text(), "visits"), "1");
      assert.notEqual(sessionCookie(fresh).cookie, cookie);
    },
  },
  {
    name: "session cart: addToCart action accumulates per cookie, isolated between clients",
    async run({ request }) {
      const a = sessionCookie(await request(CART)).cookie;
      const b = sessionCookie(await request(CART)).cookie;
      const { add, clear } = await cartActions(request, a);

      await post(request, add, { item: "apple", qty: "2" }, { cookie: a });
      const afterA = await post(
        request,
        add,
        { item: "apple", qty: "1" },
        { cookie: a },
      );
      assert.equal(afterA.status, 200);
      assert.deepEqual(cartOf(await afterA.text()), { apple: 3 });

      await post(request, add, { item: "pear", qty: "5" }, { cookie: b });
      const pageA = await request(CART, { headers: { cookie: a } });
      const pageB = await request(CART, { headers: { cookie: b } });
      assert.deepEqual(cartOf(await pageA.text()), { apple: 3 });
      assert.deepEqual(cartOf(await pageB.text()), { pear: 5 });

      const bad = await post(
        request,
        add,
        { item: "durian", qty: "0" },
        { cookie: a },
      );
      assert.equal(bad.status, 400);
      const badHtml = await bad.text();
      assert.match(badHtml, /data-error-for="item"/);
      assert.match(badHtml, /data-error-for="qty"/);
      assert.deepEqual(
        cartOf(badHtml),
        { apple: 3 },
        "invalid input changed it",
      );

      const cleared = await post(request, clear, {}, { cookie: a });
      assert.deepEqual(cartOf(await cleared.text()), {});
      const stillB = await request(CART, { headers: { cookie: b } });
      assert.deepEqual(cartOf(await stillB.text()), { pear: 5 });
    },
  },
  {
    name: "RPC checkout: ActionError BAD_REQUEST on an empty cart, else total and empty",
    async run({ request }) {
      const cookie = sessionCookie(await request(CART)).cookie;
      const checkout = () =>
        request("/_actions/s82.checkout", {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: "{}",
        });
      const empty = await checkout();
      assert.equal(empty.status, 400);
      const error = await empty.json();
      assert.equal(error.code, "BAD_REQUEST");
      assert.equal(error.message, "the cart is empty");

      const { add } = await cartActions(request, cookie);
      await post(request, add, { item: "pear", qty: "2" }, { cookie });
      await post(request, add, { item: "apple", qty: "1" }, { cookie });
      const done = await checkout();
      assert.equal(done.status, 200);
      // devalue: a flat array, the object's values are indexes into it.
      assert.equal(await done.text(), '[{"items":1},3]');
      const page = await request(CART, { headers: { cookie } });
      assert.deepEqual(cartOf(await page.text()), {});
    },
  },
  {
    name: "browser without JS: the form posts and the page shows errors, then the result",
    async run({ base, browser }) {
      const context = await (
        await browser()
      ).newContext({ javaScriptEnabled: false });
      try {
        const page = await context.newPage();
        await page.goto(`${base}${FORM}`);
        await page.fill("#name", "Neo");
        await page.fill("#email", "nope");
        await page.fill("#age", "33");
        await page.click("#s82-subscribe button");
        await page.waitForLoadState();
        assert.match(page.url(), /_action=s82\.subscribe/, "no form POST");
        assert.equal(await page.locator('[data-error-for="email"]').count(), 1);
        await page.fill("#email", "neo@example.com");
        await page.click("#s82-subscribe button");
        await page.waitForSelector("[data-result]");
        assert.equal(
          await page.locator("[data-result]").innerText(),
          "Welcome Neo (33)",
        );
      } finally {
        await context.close();
      }
    },
  },
  {
    name: "browser with JS: submit is enhanced, the result appears without a navigation",
    async run({ base, browser }) {
      const context = await (await browser()).newContext();
      try {
        const page = await context.newPage();
        await page.goto(`${base}${FORM}`);
        await page.waitForSelector("#s82-subscribe[data-enhanced]");
        await page.evaluate(() => (window.s82Marker = "same document"));
        await page.fill("#name", "Trinity");
        await page.fill("#email", "trinity@example.com");
        await page.fill("#age", "12");
        await page.click("#s82-subscribe button");
        await page.waitForSelector('[data-error-for="age"]');
        await page.fill("#age", "29");
        await page.click("#s82-subscribe button");
        await page.waitForSelector("[data-result]");
        assert.equal(
          await page.locator("[data-result]").innerText(),
          "Welcome Trinity (29)",
        );
        assert.equal(await page.locator("[data-error-for]").count(), 0);
        assert.equal(
          await page.evaluate(() => window.s82Marker),
          "same document",
          "the page navigated",
        );
        assert.equal(new URL(page.url()).search, "", "the URL changed");
      } finally {
        await context.close();
      }
    },
  },
  {
    name: "browser: two contexts keep separate carts that survive reloads",
    async run({ base, browser }) {
      const b = await browser();
      const [one, two] = [await b.newContext(), await b.newContext()];
      try {
        const [p1, p2] = [await one.newPage(), await two.newPage()];
        await p1.goto(`${base}${CART}`);
        await p2.goto(`${base}${CART}`);
        await p1.selectOption("#item", "apple");
        await p1.fill("#qty", "4");
        await Promise.all([
          p1.waitForNavigation(),
          p1.click("#s82-add button"),
        ]);
        // goto, not reload: reloading the POST result would submit it again.
        await p1.goto(`${base}${CART}`);
        await p2.goto(`${base}${CART}`);
        const cart = async (page) =>
          JSON.parse(
            decodeURIComponent(
              await page.locator("[data-cart]").getAttribute("data-cart"),
            ),
          );
        assert.deepEqual(await cart(p1), { apple: 4 });
        assert.deepEqual(await cart(p2), {});
        assert.equal(
          await p1.locator("[data-visits]").getAttribute("data-visits"),
          "2",
          "a POST render counted as a visit",
        );
        const [stored] = await one.cookies(`${base}/`);
        assert.equal(stored?.name, COOKIE);
        assert.equal(stored?.httpOnly, true);
      } finally {
        await one.close();
        await two.close();
      }
    },
  },
];
