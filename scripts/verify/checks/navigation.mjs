// navigation — client-side navigation (S6.2, <ClientRouter />): moving between pages swaps the document in place,
// and everything a full page load used to do happens exactly once on the new page.
//
//   npm run verify -- --only=navigation
//
// Candidate-only (scope "feature"): the baseline does full page loads. One scenario in Chromium at 1280×900, system
// light, clipboard permissions granted. GA and the comments API are not contacted: gtag.js stays blocked
// (lib/browser.mjs) so window.dataLayer holds exactly what the page pushed, and GET {API}/v1/posts/<id>/threads, {API}
// being the origin of the pages' <post-comments data-api>, is answered here with an empty list and counted per post.
//
// Pages: "/" and two posts linked from the home list. B is the first listed post with a code block and a toc,
// A the first listed post that is not B (with --route, posts among the selected routes are preferred).
//   home      open "/" (a full load), save the dark theme with the toggle, set a window marker.
//   A         hover A's link on the home list: a request for A goes out before the click (prefetch on hover);
//             then click it.
//   B         click a link to B appended to A's <body> (A need not link to B; the router handles every same-origin
//             <a>).
//   back      history.back() → A
//   back      history.back() → "/"
//   forward   history.forward() → A
// After each step, once astro:page-load has fired and the page has settled — one item each:
//   reload    the window marker is still there (no document load happened)
//   location  location.pathname is the step's route and document.title the <title> of its served HTML
//   page_view the GA page views in dataLayer are exactly one: the first page's gtag("config", id) (it sends a
//             page_view unless { send_page_view: false }). Later pages are counted by gtag.js itself (GA4 enhanced
//             measurement, page changes on browser history events), so the page must not push its own
//             gtag("event", "page_view", …) after a swap: that was counted twice (W9). No second config.
//   theme     data-theme is "dark" when astro:after-swap fires (set before the swap; set later is a flash of the
//             light page) and after settling, and the toggle's aria-pressed is "true"
//   comments  on a post: one <post-comments> whose data-post is the post's id, its threads requested exactly once
//             during this step and no other post's. Elsewhere: no <post-comments>, no threads requested. Nowhere a
//             utteranc.es script.
//   B only    the first code block's "복사" button puts the block's text in the clipboard; when B has a toc, a
//             heading scrolled to the top makes its toc link, and only it, aria-current="true".
// Last item: on the final page, a click on the toggle switches to light (its listener survived the swaps).
//
// Allowlist: none.
import { load } from "cheerio";

import { commentsApiOrigins, openBrowser } from "../lib/browser.mjs";
import { candidateRoutes, editPages, quote } from "../lib/html.mjs";

const NAME = "navigation";
const VIEWPORT = { width: 1280, height: 900 };
const WAIT_MS = 5_000;
const COMMENTS = "post-comments";
const UTTERANCES = 'script[src*="utteranc.es"]';
const THREADS = /^\/v1\/posts\/([^/]+)\/threads$/;
const TOC = 'nav[aria-label="목차"]';
const COPY = "복사";

const isPost = (route) => /^\/posts\/[^/]+$/.test(route);
const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

/** Installed once, after the first load: survives only as long as the document does. */
function installProbe(marker) {
  window.__verifyNav = { marker, loads: 0, themeAtSwap: [] };
  document.addEventListener("astro:page-load", () => {
    window.__verifyNav.loads += 1;
  });
  document.addEventListener("astro:after-swap", () => {
    window.__verifyNav.themeAtSwap.push(
      document.documentElement.dataset.theme ?? null,
    );
  });
}

function readState({ utterances, comments }) {
  const pageViews = [];
  for (const entry of Array.from(window.dataLayer ?? [])) {
    const args = Array.from(entry ?? []);
    if (args[0] === "config" && args[2]?.send_page_view !== false)
      pageViews.push({ kind: "config", id: String(args[1]) });
    else if (args[0] === "event" && args[1] === "page_view")
      pageViews.push({
        kind: "event",
        path: args[2]?.page_path ?? null,
        title: args[2]?.page_title ?? null,
      });
  }
  return {
    marker: window.__verifyNav?.marker ?? null,
    loads: window.__verifyNav?.loads ?? null,
    themeAtSwap: window.__verifyNav?.themeAtSwap ?? [],
    path: location.pathname,
    title: document.title,
    theme: document.documentElement.dataset.theme ?? null,
    pressed: Array.from(document.querySelectorAll(".theme-toggle"), (button) =>
      button.getAttribute("aria-pressed"),
    ),
    pageViews,
    utterances: document.querySelectorAll(utterances).length,
    sections: Array.from(document.querySelectorAll(comments), (section) =>
      section.getAttribute("data-post"),
    ),
  };
}

// ── the scenario ────────────────────────────────────────────────────────────────────────────────

function pagesOf(html) {
  const $ = load(html);
  return {
    title: $("title").first().text(),
    blocks: $("pre.astro-code")
      .toArray()
      .map((el) => $(el).text()),
    toc: $(TOC)
      .find("a")
      .toArray()
      .map((el) => el.attribs.href ?? "")
      .filter((href) => href.startsWith("#")),
    links: $("a[href]")
      .toArray()
      .map((el) => el.attribs.href),
  };
}

/** "/" and posts A, B as described at the top. → { home, a, b } of { route, title, blocks, toc, links } or a reason. */
async function choosePages(ctx) {
  const all = candidateRoutes(
    Object.create(ctx, { args: { value: { ...ctx.args, route: [] } } }),
  );
  if (!all.includes("/")) return "no / in the candidate";
  const homeHtml = await ctx.html("candidate", "/");
  if (homeHtml === null) return "no / in the candidate";
  const home = { route: "/", ...pagesOf(homeHtml) };
  const listed = [
    ...new Set(home.links.filter((href) => isPost(href) && all.includes(href))),
  ];
  const selected = new Set((ctx.args?.route ?? []).filter(isPost));
  const ordered = [
    ...listed.filter((route) => selected.has(route)),
    ...listed.filter((route) => !selected.has(route)),
  ];
  const info = new Map();
  for (const route of ordered)
    info.set(route, { route, ...pagesOf(await ctx.html("candidate", route)) });
  const b = ordered
    .map((route) => info.get(route))
    .find((page) => page.blocks.length > 0 && page.toc.length > 0);
  if (!b) return "no post linked from / has both a code block and a toc";
  const a = ordered.map((route) => info.get(route)).find((page) => page !== b);
  if (!a) return "/ links to fewer than two posts";
  return { home, a, b };
}

async function scenario(browser, base, pages, api) {
  const { home, a, b } = pages;
  return browser.withPage(VIEWPORT, async (tab) => {
    const { page } = tab;
    const origin = new URL(base).origin;
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], { origin });
    // Registered after lib/browser.mjs's catch-all route (which blocks the API), so it is asked first.
    const threads = []; // the post id of every GET of a thread list, in order
    if (api)
      await page.route(`${api}/**`, (route) => {
        const request = route.request();
        const post = THREADS.exec(new URL(request.url()).pathname)?.[1];
        if (request.method() !== "GET" || !post)
          return route.abort("blockedbyclient");
        threads.push(decodeURIComponent(post));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": origin },
          body: JSON.stringify({ threads: [], nextCursor: null }),
        });
      });

    const items = [];
    const marker = `nav-${Date.now()}-${Math.random()}`;
    const status = await tab.open(new URL("/", base).href);
    if (status !== 200) return [{ route: "/", problems: [`HTTP ${status}`] }];

    // Dark, saved, chosen with the toggle as a reader would.
    await page.locator(".theme-toggle").first().click();
    await page.waitForFunction(
      () => document.documentElement.dataset.theme === "dark",
      null,
      { timeout: WAIT_MS },
    );
    await page.evaluate(installProbe, marker);

    const steps = [];
    let fetched = 0;
    let loads = 0;

    const after = async (step, navigate) => {
      steps.push(step);
      const problems = [];
      if (navigate) {
        loads += 1;
        try {
          await navigate();
          await page.waitForFunction(
            (n) => !window.__verifyNav || window.__verifyNav.loads >= n,
            loads,
            { timeout: WAIT_MS * 2 },
          );
        } catch (error) {
          problems.push(`navigation did not finish: ${oneLine(error)}`);
        }
        await tab.settle().catch((error) => {
          problems.push(`did not settle: ${oneLine(error)}`);
        });
      }
      // The loader asks for the threads when the page is idle: give it that long, when it has not yet.
      const id = isPost(step.route) ? step.route.slice("/posts/".length) : null;
      const until = Date.now() + WAIT_MS;
      while (id && !threads.slice(fetched).includes(id) && Date.now() < until)
        await page.waitForTimeout(50);
      const state = await page.evaluate(readState, {
        utterances: UTTERANCES,
        comments: COMMENTS,
      });

      // reload
      if (state.marker !== marker)
        problems.push(
          "the window marker is gone: the page was loaded as a new document",
        );
      // location
      if (state.path !== step.route)
        problems.push(`location ${state.path}, expected ${step.route}`);
      if (state.title !== step.title)
        problems.push(
          `<title> ${quote(state.title, 40)}, expected ${quote(step.title, 40)}`,
        );
      // page_view
      // Only the first page's config: gtag.js reports the later pages from history changes on its own.
      const expected = [`config ${steps[0].route}`];
      const actual = state.pageViews.map((view, i) =>
        view.kind === "config"
          ? `config ${i === 0 ? steps[0].route : "?"}`
          : `event ${view.path} ${quote(view.title ?? "", 30)}`,
      );
      if (state.marker === marker && expected.join("\n") !== actual.join("\n"))
        problems.push(
          `page_view [${actual.join(" | ")}], expected [${expected.join(" | ")}]`,
        );
      // theme
      if (navigate) {
        const atSwap = state.themeAtSwap.at(-1);
        if (state.themeAtSwap.length !== loads)
          problems.push(
            `astro:after-swap fired ${state.themeAtSwap.length} times after ${loads} navigations`,
          );
        else if (atSwap !== "dark")
          problems.push(`data-theme ${quote(atSwap)} at astro:after-swap`);
      }
      if (state.theme !== "dark")
        problems.push(`data-theme ${quote(state.theme)} after settling`);
      if (state.pressed.length !== 1 || state.pressed[0] !== "true")
        problems.push(
          `toggle aria-pressed [${state.pressed.join(", ")}], expected [true]`,
        );
      // comments
      const asked = threads.slice(fetched);
      fetched = threads.length;
      if (state.utterances)
        problems.push(`${state.utterances} utteranc.es scripts`);
      if (id) {
        if (!api) problems.push(`no <${COMMENTS} data-api> in the build`);
        if (state.sections.length !== 1 || state.sections[0] !== id)
          problems.push(
            `<${COMMENTS}> data-post [${state.sections.join(", ")}], expected [${id}]`,
          );
        if (asked.length !== 1 || asked[0] !== id)
          problems.push(
            `threads requested for [${asked.join(", ")}] during this step, expected [${id}] once`,
          );
      } else if (state.sections.length || asked.length)
        problems.push(
          `comments on a page that is not a post: ${state.sections.length} <${COMMENTS}>, threads requested for [${asked.join(", ")}]`,
        );
      if (step.extra) await step.extra(problems);
      items.push({ route: step.route, step: step.name, problems });
    };

    await after({ name: "home", ...home });

    await after({ name: "A", ...a }, async () => {
      const link = page.locator(`a[href="${a.route}"]`).first();
      const prefetched = page.waitForRequest(
        (request) => {
          const url = new URL(request.url());
          return (
            url.origin === origin &&
            (url.pathname === a.route || url.pathname === `${a.route}.html`)
          );
        },
        { timeout: WAIT_MS },
      );
      await link.hover();
      try {
        await prefetched;
      } catch {
        items.push({
          route: a.route,
          step: "prefetch",
          problems: [`no request for ${a.route} after hovering its link`],
        });
      }
      await link.click();
    });

    await after(
      {
        name: "B",
        ...b,
        extra: async (problems) => {
          // copy
          const pre = page.locator("pre.astro-code").first();
          const button = pre.getByRole("button", { name: COPY, exact: true });
          if ((await button.count()) !== 1)
            problems.push(`first code block has no button named "${COPY}"`);
          else {
            await page.evaluate(() => navigator.clipboard.writeText(""));
            await button.click();
            const until = Date.now() + WAIT_MS;
            let text = "";
            while (Date.now() < until) {
              text = await page.evaluate(() => navigator.clipboard.readText());
              if (text === b.blocks[0]) break;
              await page.waitForTimeout(50);
            }
            if (text !== b.blocks[0])
              problems.push(
                `copy: clipboard ${quote(text, 40)} ≠ block ${quote(b.blocks[0], 40)}`,
              );
          }
          // scroll spy
          let examined = false;
          for (let i = 0; i < b.toc.length && !examined; i++) {
            const href = b.toc[i];
            const id = decodeURIComponent(href.slice(1));
            const nextId = b.toc[i + 1]
              ? decodeURIComponent(b.toc[i + 1].slice(1))
              : "";
            const where = await page.evaluate(
              ({ id, nextId }) => {
                const heading = document.getElementById(id);
                if (!heading) return null;
                window.scrollTo({
                  top: window.scrollY + heading.getBoundingClientRect().top,
                  behavior: "instant",
                });
                const top = heading.getBoundingClientRect().top;
                const next = nextId ? document.getElementById(nextId) : null;
                return {
                  top,
                  gap: next ? next.getBoundingClientRect().top - top : Infinity,
                  viewport: window.innerHeight,
                };
              },
              { id, nextId },
            );
            if (
              !where ||
              Math.abs(where.top) >= 2 ||
              where.gap < where.viewport / 2
            )
              continue;
            examined = true;
            try {
              await page.waitForFunction(
                ({ selector, href }) => {
                  const links = Array.from(
                    document.querySelectorAll(
                      `${selector} a[aria-current="true"]`,
                    ),
                    (link) => link.getAttribute("href"),
                  );
                  return links.length === 1 && links[0] === href;
                },
                { selector: TOC, href },
                { timeout: WAIT_MS, polling: "raf" },
              );
            } catch {
              problems.push(`scroll spy: ${href} at the top is not current`);
            }
          }
          if (!examined)
            problems.push(
              "scroll spy: no toc heading could be scrolled to the top",
            );
          await page.evaluate(() =>
            window.scrollTo({ top: 0, behavior: "instant" }),
          );
        },
      },
      async () => {
        await page.evaluate((route) => {
          const link = document.createElement("a");
          link.href = route;
          link.textContent = "B";
          link.id = "verify-nav-b";
          document.body.append(link);
        }, b.route);
        await page.locator("#verify-nav-b").click();
      },
    );

    await after({ name: "back", ...a }, () =>
      page.evaluate(() => history.back()),
    );
    await after({ name: "back", ...home }, () =>
      page.evaluate(() => history.back()),
    );
    await after({ name: "forward", ...a }, () =>
      page.evaluate(() => history.forward()),
    );

    // The toggle still works on a swapped-in header.
    const toggle = [];
    try {
      await page.locator(".theme-toggle").first().click();
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.theme === "light" &&
          document
            .querySelector(".theme-toggle")
            ?.getAttribute("aria-pressed") === "false",
        null,
        { timeout: WAIT_MS },
      );
    } catch {
      const theme = await page.evaluate(
        () => document.documentElement.dataset.theme,
      );
      toggle.push(
        `toggle on ${a.route} after navigating: data-theme ${quote(theme)}, expected light with aria-pressed false`,
      );
    }
    items.push({ route: a.route, step: "toggle", problems: toggle });

    if (tab.failures.length)
      items.push({
        route: "-",
        step: "requests",
        problems: [`unserved requests: ${tab.failures.join(", ")}`],
      });
    return items;
  });
}

export default {
  name: NAME,
  kind: "browser",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    let pass = 0;

    const pages = await choosePages(ctx);
    if (typeof pages === "string")
      return {
        ok: false,
        pass: 0,
        fail: 1,
        failed: [{ route: "-", detail: pages }],
      };

    const base = await ctx.serve("candidate");
    const api = [...commentsApiOrigins(ctx.candidateDir)].sort()[0] ?? null;
    // openBrowser serves both sides to know which origins are local; this check never reads the baseline.
    const browser = await openBrowser(
      Object.create(ctx, { serve: { value: () => ctx.serve("candidate") } }),
    );
    let items;
    try {
      items = await scenario(browser, base, pages, api);
    } catch (error) {
      items = [{ route: "-", step: "scenario", problems: [oneLine(error)] }];
    } finally {
      await browser.close();
    }

    // The scenario needs "/" and two posts whatever --route selects; the grid (cells) covers only the selected
    // routes. Items on the other pages still count and fail the check.
    const selected = new Set(candidateRoutes(ctx));
    for (const item of items) {
      if (item.problems.length === 0) {
        pass++;
        if (selected.has(item.route)) cells[item.route] ??= "pass";
        continue;
      }
      failed.push({
        route: item.route,
        detail: `${item.step}: ${item.problems.join("; ")}`,
      });
      if (selected.has(item.route)) cells[item.route] = "fail";
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: {
        pages: { a: pages.a.route, b: pages.b.route },
        steps: items.map(({ route, step, problems }) => ({
          route,
          step,
          problems,
        })),
      },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        // A second listener that also reports every swap, as a copy of the snippet in another component would.
        name: "옮겨 갈 때마다 page_view 를 한 번 더 보낸다",
        apply(dir) {
          editPages(
            dir,
            /<head>/g,
            '<head><script>document.addEventListener("astro:after-swap",function(){gtag("event","page_view",{page_title:document.title,page_location:location.href,page_path:location.pathname})})</script>',
          );
        },
      },
      {
        // Every post's section names the first post: after a swap the loader asks for another post's comments.
        name: "post-comments 의 data-post 가 자기 글이 아니다",
        apply(dir) {
          let first = null;
          editPages(
            dir,
            /(<post-comments\b[^>]*\bdata-post=")([^"]*)"/g,
            (_, head, id) => {
              first ??= id;
              return `${head}${first}"`;
            },
          );
        },
      },
      {
        name: "바꿔 넣을 새 문서에 테마를 적지 않는다(astro:before-swap 리스너 없음)",
        apply(dir) {
          editPages(
            dir,
            /"astro:before-swap"/g,
            '"astro:before-swap-disabled"',
          );
        },
      },
    ],
  },
};
