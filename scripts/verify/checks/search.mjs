// search — site search (/search, Pagefind): the index holds the post bodies only, a Korean query finds the post it
// should, a ?q= link opens with its results, typing keeps ?q= in the address without adding history entries, and it
// all works across client-side navigation (<ClientRouter />) under the site's CSP, with Pagefind loaded only when the
// reader searches.
//
//   npm run verify -- --only=search
//
// Candidate-only (scope "feature"): the old site has no search.
//
// Static items, from the HTML and files of the candidate (every selected route):
//   page        every route: the header nav links to /search with the text "검색"; no <script src>, modulepreload or
//               other link loads anything under /pagefind/ (Pagefind is imported on demand by the search page only).
//               A post: exactly one [data-pagefind-body], and it is the <main>; the toc, the series nav, the back link
//               and the copy-button host are outside it; og:title, article:published_time and article:section carry
//               the data-pagefind-meta that the results show (title, date, category). Any other page: no
//               [data-pagefind-body] (it would be indexed).
//   /search     one role=search box holding exactly one text input whose accessible name (aria-label) is "검색".
//   index       /pagefind/pagefind.js and /pagefind/pagefind-entry.json are served; the entry's page count for
//               "ko" equals the number of post routes of the candidate.
//
// Browser items: Chromium at 375×800 (the phone layout), lib/browser.mjs routing (GA, utterances blocked).
// For every page of a step: no `securitypolicyviolation` event, no page error and no console error (except the
// harness's own blocked off-site requests).
//   deeplink    full load of /search?q=<CASES[0]>: the input holds the query and the results are right (below).
//   type        on that page, fill the input with each other case: location.search has ?q=<query>, history.length
//               did not grow (replaceState), and the results are right.
//   lazy        full load of /search without ?q=: no request under /pagefind/ until the input gets focus, then
//               pagefind.js is requested. Full loads of "/" and the first post: no request under /pagefind/.
//   router      "/" (full load, a window marker set) → click the header link "검색" → type CASES[0] → click its
//               expected result → history.back() (results for CASES[0] again, from the address) → click a link to
//               /search?q=<CASES[1]> appended to the page → click the header's home link. Each step: the marker is
//               still there (no document load), location is right. At /search the results are right. Over the whole
//               scenario pagefind.js, pagefind-entry.json and the wasm file were each requested exactly once (one
//               Pagefind for the window, however often /search is entered).
// "The results are right" for a case: the status names the query; the expected post is among the result links
// (exactly the only one when the case says so); its result shows the post's og:title, the date of its
// article:published_time and its article:section; its excerpt has a <mark> whose text starts with a query word.
//
// Allowlist: none.
import fs from "node:fs";
import path from "node:path";

import { load } from "cheerio";

import { openBrowser } from "../lib/browser.mjs";
import {
  addPage,
  candidateRoutes,
  editPages,
  internalPath,
  mutateFile,
  NEW_PAGE,
  postFiles,
  probe,
  quote,
  readSiteFile,
} from "../lib/html.mjs";

const NAME = "search";
const SEARCH = "/search";
const PAGEFIND = "/pagefind/";
const VIEWPORT = { width: 375, height: 800 };
const WAIT_MS = 10_000;
const INPUT = 'input[aria-label="검색"]';
const STATUS = ".search-status";

/** Real Korean queries and the post each must find (words from the post bodies, not their titles). */
const CASES = [
  {
    query: "명제",
    route: "/posts/how-to-check-two-types-are-equal-in-ts",
    only: true,
  },
  { query: "내장 객체", route: "/posts/proxy-to-built-in-objects" },
  { query: "서드 파티", route: "/posts/ts-ambient-type-declaration" },
  { query: "정규표현식", route: "/posts/regular-expression-1", only: true },
];

/** Outside the indexed body on a post: what the index must not contain. */
const OUTSIDE_BODY = {
  toc: 'nav[aria-label="목차"]',
  series: 'nav[aria-label="시리즈"]',
  "back link": "back-link, a.back-link",
  "copy buttons": "copy-code",
};

/** data-pagefind-meta each post must carry (what a result shows). */
const META = {
  title: 'meta[property="og:title"][data-pagefind-meta="title[content]"]',
  date: 'meta[property="article:published_time"][data-pagefind-meta="date[content]"]',
  category:
    'meta[property="article:section"][data-pagefind-meta="category[content]"]',
};

const isPost = (route) => /^\/posts\/[^/]+$/.test(route);
const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

// ── static ──────────────────────────────────────────────────────────────────────────────────────

function pageProblems($, route) {
  const problems = [];
  const nav = $("header a")
    .toArray()
    .filter((el) => internalPath(el.attribs.href ?? "", route) === SEARCH);
  if (nav.length !== 1 || $(nav[0]).text().trim() !== "검색")
    problems.push(
      `header: ${nav.length} links to ${SEARCH}${nav.length ? ` (text ${quote($(nav[0]).text().trim())})` : ""}, expected one named "검색"`,
    );
  for (const el of $("script[src], link[href]").toArray()) {
    const ref = el.attribs.src ?? el.attribs.href;
    const target = internalPath(ref, route);
    if (target?.startsWith(PAGEFIND))
      problems.push(`<${el.name}> loads ${ref} up front`);
  }
  const bodies = $("[data-pagefind-body]");
  if (isPost(route)) {
    if (bodies.length !== 1 || bodies[0].name !== "main")
      problems.push(
        `[data-pagefind-body] on ${bodies.length} elements (${bodies
          .toArray()
          .map((el) => el.name)
          .join(", ")}), expected the <main> only`,
      );
    else
      for (const [what, selector] of Object.entries(OUTSIDE_BODY))
        if (bodies.find(selector).length)
          problems.push(`the ${what} is inside the indexed body`);
    for (const [key, selector] of Object.entries(META))
      if ($(selector).length !== 1)
        problems.push(`no data-pagefind-meta for ${key} (${selector})`);
  } else if (bodies.length)
    problems.push(
      `[data-pagefind-body] on a page that is not a post: it would be indexed`,
    );
  if (route === SEARCH) {
    const boxes = $('[role="search"]');
    const inputs = boxes.find("input");
    if (
      boxes.length !== 1 ||
      inputs.length !== 1 ||
      inputs.attr("aria-label") !== "검색"
    )
      problems.push(
        `${boxes.length} role=search boxes with ${inputs.length} inputs (aria-label ${quote(inputs.attr("aria-label"))}), expected one input named "검색"`,
      );
  }
  return problems;
}

async function indexProblems(ctx, postCount) {
  const problems = [];
  for (const file of ["pagefind.js", "pagefind-entry.json"]) {
    const { status } = await probe(ctx, "candidate", `${PAGEFIND}${file}`);
    if (status !== 200) problems.push(`${PAGEFIND}${file} → ${status}`);
  }
  const entry = await readSiteFile(
    ctx,
    "candidate",
    "pagefind/pagefind-entry.json",
  );
  if (entry) {
    let count = null;
    try {
      count = JSON.parse(entry.toString("utf8"))?.languages?.ko?.page_count;
    } catch (error) {
      problems.push(`pagefind-entry.json: ${oneLine(error)}`);
    }
    if (count !== postCount)
      problems.push(
        `the index holds ${count ?? "no"} "ko" pages, the candidate has ${postCount} posts`,
      );
  }
  return problems;
}

// ── in the browser ──────────────────────────────────────────────────────────────────────────────

/** Installed before every document: violations are kept on window (ClientRouter keeps the window). */
function recordViolations() {
  window.__verifySearchViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__verifySearchViolations.push(
      `${event.effectiveDirective} ${event.blockedURI || "inline"}`,
    );
  });
}

function readResults({ status, input }) {
  return {
    status: document.querySelector(status)?.textContent ?? "",
    value: document.querySelector(input)?.value ?? null,
    path: location.pathname,
    q: new URLSearchParams(location.search).get("q"),
    historyLength: history.length,
    marker: window.__verifySearchMarker ?? null,
    violations: window.__verifySearchViolations ?? [],
    results: Array.from(document.querySelectorAll(".search-result"), (li) => ({
      href: li.querySelector("h3 a")?.getAttribute("href") ?? null,
      title: li.querySelector("h3 a")?.textContent ?? "",
      date: li.querySelector(".search-meta time")?.textContent ?? "",
      category: li.querySelector(".search-category")?.textContent ?? "",
      marks: Array.from(li.querySelectorAll(".search-excerpt mark"), (mark) =>
        mark.textContent.trim(),
      ),
    })),
  };
}

/** The status settles on the query (results or none) or on the failure line. */
async function waitForQuery(page, query) {
  await page.waitForFunction(
    ({ selector, query }) => {
      const text = document.querySelector(selector)?.textContent ?? "";
      return (
        text.includes(`“${query}”`) || text.includes("불러오지 못했습니다")
      );
    },
    { selector: STATUS, query },
    { timeout: WAIT_MS },
  );
}

function resultProblems(state, testCase, posts) {
  const problems = [];
  const { query, route, only } = testCase;
  const post = posts.get(route);
  if (!state.status.includes(`“${query}”`))
    problems.push(`status ${quote(state.status, 60)}`);
  const hrefs = state.results.map((result) => result.href);
  const hit = state.results.find((result) => result.href === route);
  if (!hit) {
    problems.push(
      `${quote(query)} did not find ${route} (results [${hrefs.join(", ")}])`,
    );
    return problems;
  }
  if (only && hrefs.length !== 1)
    problems.push(
      `${quote(query)} found [${hrefs.join(", ")}], expected ${route} only`,
    );
  if (hit.title !== post.title)
    problems.push(
      `title ${quote(hit.title, 40)}, expected ${quote(post.title, 40)}`,
    );
  if (hit.date !== post.date)
    problems.push(`date ${quote(hit.date)}, expected ${quote(post.date)}`);
  if (hit.category !== post.category)
    problems.push(
      `category ${quote(hit.category)}, expected ${quote(post.category)}`,
    );
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (
    !hit.marks.some((mark) =>
      words.some((word) => mark.toLowerCase().startsWith(word)),
    )
  )
    problems.push(
      `excerpt marks [${hit.marks.map((mark) => quote(mark, 20)).join(", ")}] do not show ${quote(query)}`,
    );
  return problems;
}

async function scenario(browser, base, posts) {
  const origin = new URL(base).origin;
  const items = [];

  const run = (fn) =>
    browser.withPage(VIEWPORT, async (tab) => {
      const { page } = tab;
      await page.addInitScript(recordViolations);
      const errors = [];
      const requests = [];
      page.on("pageerror", (error) =>
        errors.push(`page error: ${oneLine(error)}`),
      );
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        // The harness aborts GA and utterances: those failed loads are its doing, not the page's.
        const where = message.location()?.url ?? "";
        if (where && !where.startsWith(origin)) return;
        errors.push(`console: ${message.text().slice(0, 160)}`);
      });
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (url.origin === origin) requests.push(url.pathname);
      });
      /** problems of this moment: violations, errors since the last call. */
      const health = async () => {
        const violations = await page
          .evaluate(() => window.__verifySearchViolations ?? [])
          .catch(() => []);
        const found = [
          ...violations.map((v) => `CSP violation: ${v}`),
          ...errors.splice(0),
        ];
        await page
          .evaluate(() => {
            if (window.__verifySearchViolations)
              window.__verifySearchViolations.length = 0;
          })
          .catch(() => {});
        return found;
      };
      const state = () =>
        page.evaluate(readResults, { status: STATUS, input: INPUT });
      return fn({ tab, page, requests, health, state });
    });

  const push = (route, step, problems) => items.push({ route, step, problems });

  // deeplink + type
  await run(async ({ tab, page, health, state }) => {
    const [first, ...rest] = CASES;
    const url = `${base}${SEARCH}?q=${encodeURIComponent(first.query)}`;
    const status = await tab.open(url);
    const problems = status === 200 ? [] : [`HTTP ${status}`];
    try {
      await waitForQuery(page, first.query);
    } catch (error) {
      problems.push(`no results: ${oneLine(error)}`);
    }
    const now = await state();
    if (now.value !== first.query)
      problems.push(
        `input ${quote(now.value)}, expected ${quote(first.query)} from ?q=`,
      );
    problems.push(...resultProblems(now, first, posts), ...(await health()));
    push(SEARCH, `deeplink ${first.query}`, problems);

    for (const testCase of rest) {
      const problems = [];
      const before = (await state()).historyLength;
      try {
        await page.locator(INPUT).fill(testCase.query);
        await waitForQuery(page, testCase.query);
      } catch (error) {
        problems.push(`no results: ${oneLine(error)}`);
      }
      const now = await state();
      if (now.q !== testCase.query)
        problems.push(
          `?q= is ${quote(now.q)}, expected ${quote(testCase.query)}`,
        );
      if (now.historyLength !== before)
        problems.push(
          `history.length ${before} → ${now.historyLength}: typing must replace the entry, not add one`,
        );
      problems.push(
        ...resultProblems(now, testCase, posts),
        ...(await health()),
      );
      push(SEARCH, `type ${testCase.query}`, problems);
    }
  });

  // lazy
  const firstPost = [...posts.keys()][0];
  for (const route of ["/", firstPost]) {
    await run(async ({ tab, requests, health }) => {
      const status = await tab.open(`${base}${route}`);
      const problems = status === 200 ? [] : [`HTTP ${status}`];
      const early = requests.filter((p) => p.startsWith(PAGEFIND));
      if (early.length)
        problems.push(`requested ${early.join(", ")} without a search`);
      problems.push(...(await health()));
      push(route, "lazy", problems);
    });
  }
  await run(async ({ tab, page, requests, health }) => {
    const status = await tab.open(`${base}${SEARCH}`);
    const problems = status === 200 ? [] : [`HTTP ${status}`];
    const early = requests.filter((p) => p.startsWith(PAGEFIND));
    if (early.length)
      problems.push(`requested ${early.join(", ")} before the input had focus`);
    try {
      const loaded = page.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === `${PAGEFIND}pagefind.js`,
        { timeout: WAIT_MS },
      );
      await page.locator(INPUT).focus();
      await loaded;
      await tab.settle();
    } catch (error) {
      problems.push(`focus did not load pagefind.js: ${oneLine(error)}`);
    }
    problems.push(...(await health()));
    push(SEARCH, "lazy", problems);
  });

  // router
  await run(async ({ tab, page, requests, health, state }) => {
    const [first, second] = CASES;
    let loads = 0;
    const status = await tab.open(`${base}/`);
    if (status !== 200) {
      push("/", "router", [`HTTP ${status}`]);
      return;
    }
    const marker = `search-${Date.now()}`;
    await page.evaluate((marker) => {
      window.__verifySearchMarker = marker;
      window.__verifySearchLoads = 0;
      document.addEventListener("astro:page-load", () => {
        window.__verifySearchLoads += 1;
      });
    }, marker);

    /** navigate, wait for astro:page-load, then `check()` → its problems. */
    const step = async (name, route, navigate, check) => {
      const problems = [];
      loads += 1;
      try {
        await navigate();
        await page.waitForFunction(
          (n) => (window.__verifySearchLoads ?? 0) >= n,
          loads,
          { timeout: WAIT_MS },
        );
        await tab.settle();
      } catch (error) {
        problems.push(`navigation did not finish: ${oneLine(error)}`);
      }
      if (check) {
        try {
          problems.push(...(await check()));
        } catch (error) {
          problems.push(oneLine(error));
        }
      }
      const now = await state();
      if (now.marker !== marker)
        problems.push("the window marker is gone: a full document load");
      if (now.path !== route)
        problems.push(`location ${now.path}, expected ${route}`);
      push(route, `router ${name}`, [...problems, ...(await health())]);
    };

    const searchLink = () =>
      page.locator(`header a[href="${SEARCH}"]`).first().click();

    // in: header link → /search, then type
    const typed = async () => {
      await page.locator(INPUT).fill(first.query);
      await waitForQuery(page, first.query);
      const now = await state();
      const problems = resultProblems(now, first, posts);
      if (now.q !== first.query)
        problems.push(`?q= is ${quote(now.q)} after typing`);
      return problems;
    };
    await step("in", SEARCH, searchLink, typed);

    // a result → the post
    await step("result", first.route, () =>
      page.locator(`.search-result h3 a[href="${first.route}"]`).click(),
    );

    // back → /search?q=<first>, from the address
    const restored = async () => {
      await waitForQuery(page, first.query);
      const now = await state();
      const problems = resultProblems(now, first, posts);
      if (now.value !== first.query)
        problems.push(`input ${quote(now.value)} after back`);
      return problems;
    };
    await step(
      "back",
      SEARCH,
      () => page.evaluate(() => history.back()),
      restored,
    );

    // /search → /search?q=<second> (a link, as a shared address would be followed)
    const followed = async () => {
      await waitForQuery(page, second.query);
      const now = await state();
      const problems = resultProblems(now, second, posts);
      if (now.value !== second.query)
        problems.push(`input ${quote(now.value)} after the link`);
      return problems;
    };
    await step(
      "link ?q=",
      SEARCH,
      async () => {
        await page.evaluate(
          (href) => {
            const link = document.createElement("a");
            link.href = href;
            link.id = "verify-search-link";
            link.textContent = "q";
            document.body.append(link);
          },
          `${SEARCH}?q=${encodeURIComponent(second.query)}`,
        );
        await page.locator("#verify-search-link").click();
      },
      followed,
    );

    // out: home link in the header
    await step("out", "/", () =>
      page.locator('header a[href="/"]').first().click(),
    );

    const once = ["pagefind.js", "pagefind-entry.json"].map(
      (file) => `${PAGEFIND}${file}`,
    );
    const counts = once.map(
      (file) => `${file} ×${requests.filter((p) => p === file).length}`,
    );
    const wasm = requests.filter((p) => /\/wasm\.[^/]+\.pagefind$/.test(p));
    const problems = [];
    if (
      once.some((file) => requests.filter((p) => p === file).length !== 1) ||
      wasm.length !== 1
    )
      problems.push(
        `Pagefind loaded more or less than once: ${counts.join(", ")}, wasm ×${wasm.length}`,
      );
    push(SEARCH, "router once", problems);
  });

  return items;
}

/** route → { title, date, category } of each candidate post, from its <head>. */
async function postInfo(ctx, routes) {
  const posts = new Map();
  for (const route of routes) {
    const $ = await ctx.dom("candidate", route);
    if (!$) continue;
    posts.set(route, {
      title: $('meta[property="og:title"]').attr("content") ?? "",
      date: (
        $('meta[property="article:published_time"]').attr("content") ?? ""
      ).slice(0, 10),
      category: $('meta[property="article:section"]').attr("content") ?? "",
    });
  }
  return posts;
}

export default {
  name: NAME,
  kind: "browser",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    const items = [];
    const selected = candidateRoutes(ctx);
    const all = candidateRoutes(
      Object.create(ctx, { args: { value: { ...ctx.args, route: [] } } }),
    );
    const postRoutes = all.filter(isPost);

    for (const route of selected) {
      const html = await ctx.html("candidate", route);
      const problems =
        html === null ? ["missing"] : pageProblems(load(html), route);
      items.push({ route, step: "page", problems });
    }
    if (!all.includes(SEARCH))
      items.push({
        route: SEARCH,
        step: "page",
        problems: ["no /search page"],
      });
    items.push({
      route: "-",
      step: "index",
      problems: await indexProblems(ctx, postRoutes.length),
    });

    const posts = await postInfo(ctx, postRoutes);
    const missing = CASES.filter((testCase) => !posts.has(testCase.route));
    if (missing.length)
      items.push({
        route: "-",
        step: "cases",
        problems: missing.map(
          (testCase) =>
            `${testCase.route} (the post for ${quote(testCase.query)}) is not in the candidate: update CASES`,
        ),
      });
    else {
      const base = await ctx.serve("candidate");
      // openBrowser serves both sides to know which origins are local; this check never reads the baseline.
      const browser = await openBrowser(
        Object.create(ctx, { serve: { value: () => ctx.serve("candidate") } }),
      );
      try {
        items.push(...(await scenario(browser, base, posts)));
      } catch (error) {
        items.push({
          route: "-",
          step: "scenario",
          problems: [oneLine(error)],
        });
      } finally {
        await browser.close();
      }
    }

    const shown = new Set(selected);
    let pass = 0;
    for (const item of items) {
      if (item.problems.length === 0) {
        pass++;
        if (shown.has(item.route)) cells[item.route] ??= "pass";
        continue;
      }
      failed.push({
        route: item.route,
        detail: `${item.step}: ${item.problems.slice(0, 3).join("; ")}${item.problems.length > 3 ? `; +${item.problems.length - 3} more` : ""}`,
      });
      if (shown.has(item.route)) cells[item.route] = "fail";
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { cases: CASES, steps: items },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "검색 색인 삭제",
        routes: [SEARCH],
        apply(dir) {
          const index = path.join(dir, "pagefind");
          if (!fs.existsSync(index))
            throw new Error(`mutation did not apply: no ${index}`);
          fs.rmSync(index, { recursive: true });
        },
      },
      {
        name: "CSP 에서 'wasm-unsafe-eval' 삭제",
        routes: [SEARCH],
        apply(dir) {
          editPages(dir, / 'wasm-unsafe-eval'/g, "");
        },
      },
      {
        name: "홈이 Pagefind 를 미리 받는다(modulepreload)",
        routes: ["/"],
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(
              "</head>",
              '<link rel="modulepreload" href="/pagefind/pagefind.js"></head>',
            ),
          );
        },
      },
      {
        name: "목차를 색인되는 본문 안으로 옮김",
        routes: (dir) => {
          const rel = postFiles(dir).find((file) =>
            fs
              .readFileSync(path.join(dir, file), "utf8")
              .includes('aria-label="목차"'),
          );
          return [`/${rel.replace(/\.html$/, "")}`];
        },
        apply(dir) {
          const rel = postFiles(dir).find((file) =>
            fs
              .readFileSync(path.join(dir, file), "utf8")
              .includes('aria-label="목차"'),
          );
          mutateFile(dir, rel, (html) => {
            const toc = html.match(
              /<nav\b[^>]*aria-label="목차"[\s\S]*?<\/nav>/,
            )?.[0];
            if (!toc) return html;
            return html
              .replace(toc, "")
              .replace(/(<main\b[^>]*data-pagefind-body[^>]*>)/, `$1${toc}`);
          });
        },
      },
      {
        name: "기준선에 없는 새 글에 data-pagefind-body 가 없다",
        routes: [NEW_PAGE.route],
        apply(dir) {
          addPage(dir, postFiles(dir)[0], (html) =>
            html.replace(/ data-pagefind-body(="")?/, ""),
          );
        },
      },
    ],
  },
};
