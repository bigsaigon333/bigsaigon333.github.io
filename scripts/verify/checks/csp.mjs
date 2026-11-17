// csp — Content Security Policy (S7.2): every page carries one policy in a <meta http-equiv>, it allows what the
// site needs (its own files, GA, utterances) and nothing else, and no page breaks it, on a full load or across
// client-side navigation (<ClientRouter />).
//
//   npm run verify -- --only=csp --route=/
//
// Candidate-only (scope "feature"): the old site has no policy. Chromium at 1280×900, system dark, a fresh context
// per page. Requests leaving the site never reach the network. The check answers or aborts them itself, and a
// request it sees has passed the policy: a request the policy blocks never leaves the renderer and shows up as a
// `securitypolicyviolation` event instead. So "blocked by the harness" (seen here, aborted or stubbed) and
// "blocked by CSP" (a violation, never seen here) cannot be confused.
//   https://www.googletagmanager.com/gtag/js   a stub that sends one hit to https://region1.google-analytics.com/g/collect
//                                              (connect-src), as gtag.js does, then nothing
//   https://utteranc.es/client.js              a stub doing what the real client does to the page (recorded from
//                                              client.js on 2026-11-13): a <style> with UTTERANCES_STYLE at the top of
//                                              <head>, then div.utterances > iframe.utterances-frame for
//                                              https://utteranc.es/utterances.html right after its <script>. The
//                                              iframe is not lazy here, so its request is made without scrolling.
//   anything else off-site                      aborted
//
// Items, each one line of the report:
//   policy      every selected route, from the HTML: exactly one <meta http-equiv="content-security-policy">, in
//               <head>, before every <script>, <style> and <link> (a policy covers only what comes after it); the
//               same text on every route (the router keeps the first page's policy, and a page that needed another
//               one would break after a swap); script-src (and script-src-elem) without 'unsafe-inline',
//               'unsafe-eval', 'unsafe-hashes', data:, blob:, *, http:, https:; object-src 'none'; base-uri set;
//               every host source in any directive is one of ALLOWED_HOSTS; GA and utterances are allowed where
//               they are used (REQUIRED).
//   load        every selected route, a full load: no securitypolicyviolation event and no "Content Security
//               Policy" console message; data-theme is "dark" when <body> is parsed (the head theme script ran
//               under the policy, before the first paint); the GA loader and a collect hit were requested; on a
//               page with the utterances script, client.js and the iframe were requested and div.utterances has
//               the client's style (position: relative).
//   navigate    "/" → post A (click) → post B (click a link appended to A): after each swap, still no violation,
//               one policy <meta> with the first page's text, data-theme "dark", and on a post client.js ran
//               again and its iframe was requested.
//
// Allowlist: none.
import fs from "node:fs";

import { load } from "cheerio";

import { mapLimit, MAX_PAGES } from "../lib/browser.mjs";
import {
  addPage,
  candidateRoutes,
  editPages,
  mutateFile,
  NEW_PAGE,
  postRoutesWith,
} from "../lib/html.mjs";

const NAME = "csp";
const VIEWPORT = { width: 1280, height: 900 };
const TIMEOUT_MS = 15_000;
const QUIET_MS = 300;
const META =
  /<meta\b[^>]*\bhttp-equiv=["']?content-security-policy["']?[^>]*>/gi;
const UTTERANCES = 'script[src^="https://utteranc.es/client.js"]';

/** host suffix → why. A host source must be one of these or a subdomain (a wildcard only below them). */
const ALLOWED_HOSTS = {
  "googletagmanager.com": "GA loader",
  "google-analytics.com": "GA collector",
  "analytics.google.com": "GA collector",
  "utteranc.es": "utterances",
};

/** directive → URLs it must allow (checked with the CSP source matching below). */
const REQUIRED = {
  "script-src-elem": [
    "https://www.googletagmanager.com/gtag/js",
    "https://utteranc.es/client.js",
  ],
  "connect-src": ["https://region1.google-analytics.com/g/collect"],
  "frame-src": ["https://utteranc.es/utterances.html"],
};

/** What the CSP spec falls back to when a directive is absent. */
const FALLBACK = {
  "script-src-elem": ["script-src-elem", "script-src", "default-src"],
  "connect-src": ["connect-src", "default-src"],
  "frame-src": ["frame-src", "child-src", "default-src"],
  "object-src": ["object-src", "default-src"],
};

const FORBIDDEN_SCRIPT = new Set([
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'unsafe-hashes'",
  "data:",
  "blob:",
  "*",
  "http:",
  "https:",
]);

/** The style utteranc.es/client.js inserts at the top of <head> (2026-11-13). */
const UTTERANCES_STYLE =
  "\n    .utterances {\n      position: relative;\n      box-sizing: border-box;\n      width: 100%;\n      max-width: 760px;\n      margin-left: auto;\n      margin-right: auto;\n    }\n    .utterances-frame {\n      color-scheme: light;\n      position: absolute;\n      left: 0;\n      right: 0;\n      width: 1px;\n      min-width: 100%;\n      max-width: 100%;\n      height: 100%;\n      border: 0;\n    }\n  ";

const UTTERANCES_STUB = `(function () {
  var script = document.currentScript;
  document.head.insertAdjacentHTML("afterbegin", "<style>" + ${JSON.stringify(UTTERANCES_STYLE)} + "</style>");
  script.insertAdjacentHTML("afterend", '<div class="utterances"><iframe class="utterances-frame" title="Comments" scrolling="no" src="https://utteranc.es/utterances.html?issue-term=title"></iframe></div>');
  window.__verifyUtterancesRuns = (window.__verifyUtterancesRuns || 0) + 1;
})();`;

const GA_STUB = `(function () {
  fetch("https://region1.google-analytics.com/g/collect?v=2&en=page_view", { method: "POST", mode: "no-cors", keepalive: true }).catch(function () {});
})();`;

const oneLine = (error) => String(error?.message ?? error).split("\n")[0];
const isPost = (route) => /^\/posts\/[^/]+$/.test(route);

// ── the policy, from the HTML ───────────────────────────────────────────────────────────────────

/** "a b; c d" → Map(name → tokens). Names lower-cased; the first of a repeated directive wins (as browsers do). */
export function parsePolicy(text) {
  const directives = new Map();
  for (const part of text.split(";")) {
    const [name, ...tokens] = part.trim().split(/\s+/).filter(Boolean);
    if (!name) continue;
    const key = name.toLowerCase();
    if (!directives.has(key)) directives.set(key, tokens);
  }
  return directives;
}

const effective = (policy, name) =>
  (FALLBACK[name] ?? [name]).map((n) => policy.get(n)).find(Boolean) ?? null;

/** Does a host source ("https://*.x.com", "utteranc.es", "https://a.b/path") match url? Keywords never do. */
function sourceMatches(source, url) {
  if (source.startsWith("'")) return false;
  if (source === "*") return true;
  const match =
    /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?(\/.*)?$/i.exec(
      source,
    );
  if (!match) return false;
  const [, scheme, wildcard, host, , pathPart] = match;
  if (scheme && `${scheme.toLowerCase()}:` !== url.protocol) return false;
  const h = host.toLowerCase();
  const hostOk = wildcard ? url.hostname.endsWith(`.${h}`) : url.hostname === h;
  if (!hostOk) return false;
  if (!pathPart || pathPart === "/") return true;
  return pathPart.endsWith("/")
    ? url.pathname.startsWith(pathPart)
    : url.pathname === pathPart;
}

const hostOfSource = (source) =>
  /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:\*\.)?([^/:]+)/i
    .exec(source)?.[1]
    ?.toLowerCase() ?? null;

const isHostSource = (token) =>
  !token.startsWith("'") &&
  !/^[a-z][a-z0-9+.-]*:$/i.test(token) &&
  token !== "*" &&
  /[.]/.test(token);

/** Problems of one page's HTML; also returns the policy text (null when there is not exactly one). */
export function policyProblems(html) {
  const problems = [];
  const metas = [...html.matchAll(META)];
  if (metas.length !== 1)
    return {
      text: null,
      problems: [
        `${metas.length} <meta http-equiv="content-security-policy">, expected 1`,
      ],
    };
  const at = metas[0].index;
  const headEnd = html.search(/<\/head>/i);
  if (headEnd === -1 || at > headEnd)
    problems.push("the policy <meta> is not in <head>");
  const first = /<(script|style|link)\b/i.exec(html);
  if (first && first.index < at)
    problems.push(
      `a <${first[1].toLowerCase()}> comes before the policy <meta>: the policy does not cover it`,
    );
  const text = load(metas[0][0])("meta").attr("content") ?? "";
  const policy = parsePolicy(text);

  for (const name of ["script-src", "script-src-elem"])
    for (const token of policy.get(name) ?? [])
      if (FORBIDDEN_SCRIPT.has(token.toLowerCase()))
        problems.push(`${name} allows ${token}`);
  if (!policy.has("script-src") && !policy.has("default-src"))
    problems.push("no script-src (nor default-src): any script may run");
  const object = effective(policy, "object-src");
  if (!object || object.join(" ") !== "'none'")
    problems.push(
      `object-src is ${object ? object.join(" ") : "unset"}, expected 'none'`,
    );
  if (!policy.has("base-uri")) problems.push("no base-uri");

  for (const [name, tokens] of policy)
    for (const token of tokens) {
      if (!isHostSource(token)) continue;
      const host = hostOfSource(token);
      const known = Object.keys(ALLOWED_HOSTS).some(
        (suffix) => host === suffix || host.endsWith(`.${suffix}`),
      );
      if (!known) problems.push(`${name} allows ${token}, not an allowed host`);
    }
  for (const [name, urls] of Object.entries(REQUIRED)) {
    const sources = effective(policy, name) ?? [];
    for (const url of urls)
      if (!sources.some((source) => sourceMatches(source, new URL(url))))
        problems.push(`${name} does not allow ${url}`);
  }
  return { text, problems };
}

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

/** Runs before any script of the page: records violations and the theme when <body> is first parsed. */
function recordPage() {
  window.__verifyCsp = { violations: [], bodyTheme: undefined, loads: 0 };
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__verifyCsp.violations.push(
      `${event.effectiveDirective || event.violatedDirective} blocked ${event.blockedURI || "?"}${
        event.sample ? ` (${event.sample.slice(0, 40)})` : ""
      }`,
    );
  });
  document.addEventListener("astro:page-load", () => {
    window.__verifyCsp.loads += 1;
  });
  new MutationObserver((_records, observer) => {
    if (!document.body) return;
    window.__verifyCsp.bodyTheme =
      document.documentElement.getAttribute("data-theme");
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
}

function pageState(utterances) {
  const box = document.querySelector("div.utterances");
  return {
    violations: window.__verifyCsp?.violations ?? [],
    bodyTheme: window.__verifyCsp?.bodyTheme ?? null,
    theme: document.documentElement.getAttribute("data-theme"),
    loads: window.__verifyCsp?.loads ?? 0,
    metas: Array.from(
      document.querySelectorAll("meta[http-equiv]"),
      (meta) => meta,
    )
      .filter(
        (meta) =>
          meta.getAttribute("http-equiv").toLowerCase() ===
          "content-security-policy",
      )
      .map((meta) => meta.getAttribute("content")),
    widget: document.querySelectorAll(utterances).length,
    runs: window.__verifyUtterancesRuns ?? 0,
    boxPosition: box ? getComputedStyle(box).position : null,
  };
}

// ── browser ─────────────────────────────────────────────────────────────────────────────────────

async function launch(origin) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  /** fn({ page, seen, consoleCsp, quiet }) in a fresh context. */
  async function withPage(fn) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      reducedMotion: "reduce",
      colorScheme: "dark",
      serviceWorkers: "block",
    });
    try {
      await context.addInitScript(recordPage);
      const seen = [];
      const consoleCsp = [];
      const net = { pending: 0, last: Date.now() };
      await context.route("**/*", async (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin) return route.continue();
        seen.push(url.href);
        const stub =
          url.origin === "https://www.googletagmanager.com" &&
          url.pathname === "/gtag/js"
            ? GA_STUB
            : url.origin === "https://utteranc.es" &&
                url.pathname === "/client.js"
              ? UTTERANCES_STUB
              : null;
        if (stub === null) return route.abort("blockedbyclient");
        return route.fulfill({
          status: 200,
          contentType: "text/javascript",
          body: stub,
        });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(TIMEOUT_MS);
      page.on("console", (message) => {
        if (/content security policy/i.test(message.text()))
          consoleCsp.push(message.text().slice(0, 160));
      });
      const settleOne = () => {
        net.pending = Math.max(0, net.pending - 1);
        net.last = Date.now();
      };
      page.on("request", () => {
        net.pending += 1;
        net.last = Date.now();
      });
      page.on("requestfinished", settleOne);
      page.on("requestfailed", settleOne);
      /** No request in flight for QUIET_MS (violation events are queued tasks: they are in by then). */
      const quiet = async () => {
        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
          if (net.pending === 0 && Date.now() - net.last >= QUIET_MS) return;
          await page.waitForTimeout(50);
        }
        throw new Error(`${net.pending} requests still pending`);
      };
      return await fn({ page, seen, consoleCsp, quiet });
    } finally {
      await context.close().catch(() => {});
    }
  }

  return { withPage, close: () => browser.close() };
}

const attempted = (seen, prefix) => seen.some((url) => url.startsWith(prefix));

/** Problems of the page as it is now: no violation, and what must have been requested. */
function loadProblems(state, seen, consoleCsp, { post }) {
  const problems = [];
  for (const violation of state.violations)
    problems.push(`blocked by CSP: ${violation}`);
  for (const message of consoleCsp) problems.push(`console: ${message}`);
  if (!attempted(seen, "https://www.googletagmanager.com/gtag/js"))
    problems.push("GA loader not requested");
  if (!seen.some((url) => /^https:\/\/[^/]*google-analytics\.com\//.test(url)))
    problems.push("GA collect hit not requested");
  if (post) {
    if (!attempted(seen, "https://utteranc.es/client.js"))
      problems.push("utterances client.js not requested");
    if (!attempted(seen, "https://utteranc.es/utterances.html"))
      problems.push("utterances iframe not requested");
    if (state.boxPosition !== "relative")
      problems.push(
        `div.utterances position ${state.boxPosition ?? "(none)"}: the client's <style> did not apply`,
      );
  }
  return problems;
}

async function checkLoad(browser, base, route, hasWidget) {
  return browser.withPage(async ({ page, seen, consoleCsp, quiet }) => {
    await page.goto(base + route, { waitUntil: "load" });
    await quiet();
    const state = await page.evaluate(pageState, UTTERANCES);
    const problems = loadProblems(state, seen, consoleCsp, {
      post: hasWidget,
    });
    if (state.bodyTheme !== "dark")
      problems.push(
        `data-theme when <body> was parsed: ${JSON.stringify(state.bodyTheme)}, expected "dark" (theme script did not run first)`,
      );
    return problems;
  });
}

/** "/" → A → B with the router. → [{ route, step, problems }] */
async function checkNavigation(browser, base, pages) {
  return browser.withPage(async ({ page, seen, consoleCsp, quiet }) => {
    const items = [];
    await page.goto(`${base}/`, { waitUntil: "load" });
    await quiet();
    const first = await page.evaluate(pageState, UTTERANCES);
    const policy = first.metas[0] ?? null;
    let runs = 0;
    let loads = first.loads;
    const step = async (name, route, navigate) => {
      const problems = [];
      seen.length = 0;
      try {
        await navigate();
        loads += 1;
        await page.waitForFunction(
          (n) => (window.__verifyCsp?.loads ?? 0) >= n,
          loads,
        );
        await quiet();
      } catch (error) {
        problems.push(`navigation did not finish: ${oneLine(error)}`);
      }
      // A full load would run recordPage again and reset the count: the wait above then times out.
      const state = await page.evaluate(pageState, UTTERANCES);
      if (new URL(page.url()).pathname !== route)
        problems.push(`at ${new URL(page.url()).pathname}, expected ${route}`);
      for (const violation of state.violations)
        problems.push(`blocked by CSP: ${violation}`);
      for (const message of consoleCsp) problems.push(`console: ${message}`);
      consoleCsp.length = 0;
      if (state.metas.length !== 1 || state.metas[0] !== policy)
        problems.push(
          `${state.metas.length} policy <meta> after the swap, expected the first page's one`,
        );
      if (state.theme !== "dark")
        problems.push(
          `data-theme ${JSON.stringify(state.theme)} after the swap`,
        );
      if (isPost(route)) {
        if (state.runs - runs !== 1)
          problems.push(
            `utterances client ran ${state.runs - runs} times, expected 1`,
          );
        if (!attempted(seen, "https://utteranc.es/utterances.html"))
          problems.push("utterances iframe not requested");
      }
      runs = state.runs;
      await page.evaluate(() => {
        window.__verifyCsp.violations.length = 0;
      });
      items.push({ route, step: name, problems });
    };

    const firstProblems = loadProblems(first, seen, consoleCsp, {
      post: false,
    });
    if (!policy) firstProblems.push("no policy <meta> on /");
    items.push({ route: "/", step: "navigate /", problems: firstProblems });
    await page.evaluate(() => {
      window.__verifyCsp.violations.length = 0;
    });
    consoleCsp.length = 0;

    await step("navigate A", pages.a, () =>
      page.locator(`a[href="${pages.a}"]`).first().click(),
    );
    await step("navigate B", pages.b, async () => {
      await page.evaluate((href) => {
        const link = document.createElement("a");
        link.href = href;
        link.id = "verify-csp-b";
        link.textContent = "B";
        document.body.append(link);
      }, pages.b);
      await page.locator("#verify-csp-b").click();
    });
    return items;
  });
}

/** "/" and the first two posts it links to (selected posts first). → { a, b } or a reason. */
function choosePosts(ctx, html) {
  if (html === null) return "no / in the candidate";
  const all = candidateRoutes(
    Object.create(ctx, { args: { value: { ...ctx.args, route: [] } } }),
  );
  const $ = load(html);
  const listed = [
    ...new Set(
      $("a[href]")
        .toArray()
        .map((el) => el.attribs.href)
        .filter((href) => isPost(href) && all.includes(href)),
    ),
  ];
  const selected = new Set((ctx.args?.route ?? []).filter(isPost));
  const ordered = [
    ...listed.filter((route) => selected.has(route)),
    ...listed.filter((route) => !selected.has(route)),
  ];
  if (ordered.length < 2) return "/ links to fewer than two posts";
  return { a: ordered[0], b: ordered[1] };
}

// ── the check ───────────────────────────────────────────────────────────────────────────────────

async function run(ctx) {
  const routes = candidateRoutes(ctx);
  const htmlOf = (route) => {
    const file = ctx.fileFor("candidate", route);
    return file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  };

  const outcomes = [];
  const texts = new Map();
  for (const route of routes) {
    const { text, problems } = policyProblems(htmlOf(route));
    if (text !== null) texts.set(route, text);
    outcomes.push({ item: "policy", route, problems });
  }
  const reference = routes.includes("/") ? "/" : routes[0];
  const referenceText = texts.get(reference);
  if (referenceText !== undefined)
    for (const outcome of outcomes) {
      const text = texts.get(outcome.route);
      if (text !== undefined && text !== referenceText)
        outcome.problems.push(
          `the policy differs from ${reference}'s: a client-side swap from ${reference} keeps that one`,
        );
    }

  const base = await ctx.serve("candidate");
  const browser = await launch(new URL(base).origin);
  try {
    const loaded = await mapLimit(routes, MAX_PAGES, async (route) => {
      let problems;
      try {
        problems = await checkLoad(
          browser,
          base,
          route,
          load(htmlOf(route))(UTTERANCES).length > 0,
        );
      } catch (error) {
        problems = [`crashed: ${oneLine(error)}`];
      }
      return { item: "load", route, problems };
    });
    outcomes.push(...loaded);

    const homeFile = ctx.fileFor("candidate", "/");
    const pages = choosePosts(
      ctx,
      homeFile && fs.existsSync(homeFile)
        ? fs.readFileSync(homeFile, "utf8")
        : null,
    );
    if (typeof pages === "string")
      outcomes.push({ item: "navigate", route: "-", problems: [pages] });
    else {
      try {
        const steps = await checkNavigation(browser, base, pages);
        for (const { route, step, problems } of steps)
          outcomes.push({ item: step, route, problems });
      } catch (error) {
        outcomes.push({
          item: "navigate",
          route: "-",
          problems: [`crashed: ${oneLine(error)}`],
        });
      }
    }
  } finally {
    await browser.close();
  }

  const failed = outcomes
    .filter((outcome) => outcome.problems.length > 0)
    .map(({ item, route, problems }) => ({
      route,
      detail: `${item}: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? `; +${problems.length - 3} more` : ""}`,
    }));
  const selected = new Set(routes);
  const cells = {};
  for (const outcome of outcomes) {
    if (!selected.has(outcome.route)) continue;
    if (cells[outcome.route] !== "fail")
      cells[outcome.route] = outcome.problems.length ? "fail" : "pass";
  }
  return {
    ok: failed.length === 0,
    pass: outcomes.length - failed.length,
    fail: failed.length,
    failed,
    cells,
    extra: { policy: referenceText ?? null, outcomes },
  };
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────────

const INJECTED = '<script>window.__cspMutant = "inline";</script>';

export default {
  name: NAME,
  kind: "browser",
  scope: "feature",
  run,

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "해시 없는 인라인 스크립트를 본문에 더함",
        routes: ["/"],
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace("</body>", `${INJECTED}</body>`),
          );
        },
      },
      {
        name: "정책에서 https://utteranc.es 를 뺌",
        routes: (dir) => postRoutesWith(dir, /utteranc\.es\/client\.js/),
        apply(dir) {
          editPages(dir, META, (meta) =>
            meta.replace(/ https:\/\/utteranc\.es/g, ""),
          );
        },
      },
      {
        name: "정책 <meta> 를 <head> 끝으로 옮김(앞의 스크립트를 덮지 못함)",
        routes: ["/"],
        apply(dir) {
          mutateFile(dir, "index.html", (html) => {
            const meta = html.match(META)?.[0] ?? "";
            return html.replace(meta, "").replace("</head>", `${meta}</head>`);
          });
        },
      },
      {
        name: "기준선에 없는 새 글에만 해시 없는 인라인 스크립트",
        routes: [NEW_PAGE.route],
        apply(dir) {
          const [route] = postRoutesWith(dir, /<main\b/);
          addPage(dir, `${route.slice(1)}.html`, (html) =>
            html.replace("</main>", `${INJECTED}</main>`),
          );
        },
      },
    ],
  },
};
