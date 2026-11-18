// anchors — section links (H1): every h2–h4 of a post links to itself, and following the link puts the heading in view.
// Candidate-only (scope "feature"): the baseline has no section links.
//
// For every post route of the candidate ("/posts/<id>"):
//   served HTML (cheerio)
//     ids        every h2, h3 and h4 inside <main> has a non-empty id that names exactly one element of the page
//                (compared percent-decoded). Korean ids and the "-1" suffix of a repeated title are ids like any other.
//     link       each of them holds exactly one a.heading-link whose href is "#<its id>" (compared percent-decoded),
//                and no a.heading-link is anywhere else in <main>. The link either holds the whole heading (its text is
//                the heading's text, not empty), or — when the heading has a link of its own, which a link may not
//                contain — is empty, has a non-empty aria-label and comes first.
//     toc        every link of <nav aria-label="목차"> points ("#<id>") at a heading that has its section link.
//   browser (Chromium 1280×900, reduced motion, one tab per route)
//     click      for each section link, in order: from the top of the page, a click makes location.hash its href and
//                puts its heading in view: the heading's top is within 2px of its scroll-margin-top, which is > 0 (it
//                is not flush with the edge), or — when the page cannot scroll further — between that and the bottom of
//                the viewport. The document is not loaded again (a window marker set before the clicks survives).
//     affordance on the first section link: its ::after is transparent at rest, opaque under the pointer and when
//                focused from the keyboard, and the keyboard focus draws an outline. With the media feature
//                "hover: none" (a touch screen: the same page in a hasTouch context) it is opaque at rest.
//   client router (once, on the first selected post with at least one section link): open "/", set a window marker,
//                click a link to the post appended to "/" (the router handles every same-origin <a>), wait for
//                astro:page-load; then the "click" item above on the last section link of the post — the marker
//                must survive all of it.
// One item per route, listing every problem (a post without h2–h4 passes: nothing to link), plus one item "router"
// for the client router scenario when a selected post has a section link.
//
// Allowlist item: "route:<route>".
import { load } from "cheerio";

import { mapLimit, openBrowser } from "../lib/browser.mjs";
import {
  NEW_PAGE,
  addPage,
  allowances,
  candidateRoutes,
  collapse,
  editPages,
  mutateFile,
  postFiles,
  postRoutesWith,
  quote,
  routeOfPage,
  textOf,
} from "../lib/html.mjs";

const NAME = "anchors";
const VIEWPORT = { width: 1280, height: 900 };
const TOC = 'nav[aria-label="목차"]';
const LINK = "a.heading-link";
/** How long a click or a client-side navigation may take to show. Only spent when it does not. */
const WAIT_MS = 3_000;
/** Self-test: a heading whose id carries the suffix of a repeated title. */
const REPEATED = /<h[234] id="[^"]*-1"><a class="heading-link"/;

const isPost = (route) => /^\/posts\/[^/]+$/.test(route);
const oneLine = (error) => String(error?.message ?? error).split("\n")[0];
const text = (el) => collapse(textOf(el));

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ── served HTML ─────────────────────────────────────────────────────────────────────────────────

/** → { problems, links: [{ id, href }] } — the section links of the page in document order. */
function staticProblems(html) {
  const $ = load(html);
  const problems = [];
  const links = [];
  const ids = $("[id]")
    .toArray()
    .map((el) => decode(el.attribs.id));

  const headings = $("main").find("h2, h3, h4").toArray();
  for (const el of headings) {
    const id = el.attribs.id ?? "";
    const name = `${el.name} ${quote(text(el), 40)}`;
    if (id === "") {
      problems.push(`${name} has no id`);
      continue;
    }
    const same = ids.filter((other) => other === decode(id)).length;
    if (same !== 1) problems.push(`${name}: id #${id} names ${same} elements`);

    const own = $(el).find(LINK).toArray();
    if (own.length !== 1) {
      problems.push(`${name} has ${own.length} ${LINK}, expected 1`);
      continue;
    }
    const link = own[0];
    const href = link.attribs.href ?? "";
    if (decode(href) !== `#${decode(id)}`)
      problems.push(`${name}: section link ${quote(href)} ≠ #${id}`);
    const otherLinks = $(el).find("a").not(link).length;
    if (otherLinks === 0) {
      if (text(link) === "" || text(link) !== text(el))
        problems.push(
          `${name}: section link text ${quote(text(link), 40)} is not the heading's`,
        );
    } else if (
      text(link) !== "" ||
      collapse(link.attribs["aria-label"] ?? "") === "" ||
      $(el).children().first()[0] !== link
    ) {
      problems.push(
        `${name} has a link of its own: the section link must come first, empty and named by aria-label`,
      );
    }
    links.push({ id: decode(id), href });
  }

  const stray =
    $("main").find(LINK).length -
    $("main").find("h2, h3, h4").find(LINK).length;
  if (stray > 0) problems.push(`${stray} ${LINK} outside h2–h4 in <main>`);

  const linked = new Set(links.map(({ id }) => id));
  for (const el of $(TOC).find("a").toArray()) {
    const href = el.attribs.href ?? "";
    if (!href.startsWith("#") || !linked.has(decode(href.slice(1))))
      problems.push(
        `toc link ${quote(href)} points at no heading with a section link`,
      );
  }

  return { problems, links };
}

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

/** Where heading `id` is: { hash, top, margin, viewport, atBottom, marker }. */
function placeOf({ id }) {
  const heading = document.getElementById(id);
  const rect = heading.getBoundingClientRect();
  const root = document.documentElement;
  return {
    hash: location.hash,
    top: rect.top,
    margin: parseFloat(getComputedStyle(heading).scrollMarginTop) || 0,
    viewport: window.innerHeight,
    atBottom:
      Math.ceil(window.scrollY + window.innerHeight) >= root.scrollHeight - 1,
    marker: window.__verifyAnchors ?? null,
  };
}

/** True once heading `id` has been reached the way a click should reach it. */
function reached({ id, href }) {
  const heading = document.getElementById(id);
  if (!heading) return false;
  let hash = location.hash;
  try {
    hash = decodeURIComponent(hash);
  } catch {
    /* keep it */
  }
  if (hash !== href) return false;
  const top = heading.getBoundingClientRect().top;
  const margin = parseFloat(getComputedStyle(heading).scrollMarginTop) || 0;
  const root = document.documentElement;
  const atBottom =
    Math.ceil(window.scrollY + window.innerHeight) >= root.scrollHeight - 1;
  return (
    Math.abs(top - margin) < 2 ||
    (atBottom && top >= margin - 2 && top < window.innerHeight)
  );
}

const afterOpacity = (el) =>
  Number(getComputedStyle(el, "::after").opacity || "1");

/** Click section link `index` from the top of the page; → problems. */
async function clickProblems(page, link, index) {
  const { id, href } = link;
  const decodedHref = `#${id}`;
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  const locator = page.locator(`main ${LINK}`).nth(index);
  try {
    await locator.click({ timeout: WAIT_MS });
  } catch (error) {
    return [`${href}: click failed: ${oneLine(error)}`];
  }
  try {
    await page.waitForFunction(
      reached,
      { id, href: decodedHref },
      { timeout: WAIT_MS, polling: "raf" },
    );
  } catch {
    const at = await page.evaluate(placeOf, { id });
    return [
      `${href}: after the click hash ${quote(decode(at.hash), 40)}, heading top ${Math.round(at.top)}px (scroll-margin-top ${at.margin}px${at.atBottom ? ", page at its end" : ""})`,
    ];
  }
  const at = await page.evaluate(placeOf, { id });
  const problems = [];
  if (!(at.margin > 0))
    problems.push(
      `${href}: scroll-margin-top ${at.margin}px, the heading lands flush with the top`,
    );
  if (at.top < 0) problems.push(`${href}: heading top ${at.top}px is hidden`);
  return problems;
}

async function affordanceProblems(page) {
  const problems = [];
  const first = page.locator(`main ${LINK}`).first();
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  if ((await first.evaluate(afterOpacity)) !== 0)
    problems.push("section link mark visible at rest");
  await first.hover();
  if ((await first.evaluate(afterOpacity)) !== 1)
    problems.push("section link mark not shown under the pointer");
  await page.mouse.move(0, 0);
  // Keyboard modality: a key press, then focus, makes :focus-visible match as Tab would.
  await page.keyboard.press("Shift");
  await first.focus();
  const focused = await first.evaluate((el) => ({
    visible: el.matches(":focus-visible"),
    opacity: Number(getComputedStyle(el, "::after").opacity || "1"),
    outline: getComputedStyle(el).outlineStyle,
    width: parseFloat(getComputedStyle(el).outlineWidth) || 0,
  }));
  if (!focused.visible)
    problems.push("section link does not match :focus-visible from keyboard");
  if (focused.opacity !== 1)
    problems.push("section link mark not shown on keyboard focus");
  if (focused.outline === "none" || focused.width <= 0)
    problems.push("section link has no focus outline");
  await first.evaluate((el) => el.blur());
  return problems;
}

/**
 * The same page in a touch context of the same browser (hasTouch makes "hover: none" match; CDP's media emulation
 * does not cover "hover"). Only the page's own origin is served: the mark is CSS, nothing else matters here.
 */
async function touchProblems(page, url) {
  const context = await page.context().browser().newContext({
    viewport: VIEWPORT,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  try {
    const origin = new URL(url).origin;
    await context.route("**/*", (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort(),
    );
    const touch = await context.newPage();
    await touch.goto(url, { waitUntil: "load" });
    if (!(await touch.evaluate(() => matchMedia("(hover: none)").matches)))
      return ['touch context does not match "hover: none"'];
    const opacity = await touch
      .locator(`main ${LINK}`)
      .first()
      .evaluate(afterOpacity);
    return opacity === 1
      ? []
      : ['section link mark hidden at rest with "hover: none" (touch)'];
  } finally {
    await context.close();
  }
}

// ── one route ───────────────────────────────────────────────────────────────────────────────────

async function examine(browser, base, route, links) {
  return browser.withPage(VIEWPORT, async (tab) => {
    const { page } = tab;
    const status = await tab.open(new URL(route, base).href);
    if (status !== 200) return [`HTTP ${status}`];
    const marker = `anchors-${Date.now()}-${Math.random()}`;
    await page.evaluate((value) => {
      window.__verifyAnchors = value;
    }, marker);
    const problems = [];
    const shown = await page.locator(`main ${LINK}`).count();
    if (shown !== links.length)
      problems.push(
        `${shown} section links in the page, ${links.length} in the HTML`,
      );
    for (let i = 0; i < Math.min(shown, links.length); i++)
      problems.push(...(await clickProblems(page, links[i], i)));
    if (links.length > 0) {
      problems.push(...(await affordanceProblems(page)));
      problems.push(...(await touchProblems(page, new URL(route, base).href)));
    }
    if ((await page.evaluate(() => window.__verifyAnchors ?? null)) !== marker)
      problems.push("the page was loaded again by a section link");
    if (tab.failures.length)
      problems.push(`unserved requests: ${tab.failures.join(", ")}`);
    return problems;
  });
}

async function routerProblems(browser, base, route, links) {
  return browser.withPage(VIEWPORT, async (tab) => {
    const { page } = tab;
    const status = await tab.open(new URL("/", base).href);
    if (status !== 200) return [`/: HTTP ${status}`];
    const marker = `anchors-${Date.now()}-${Math.random()}`;
    await page.evaluate(
      ({ value, route }) => {
        window.__verifyAnchors = value;
        window.__verifyAnchorsLoads = 0;
        document.addEventListener("astro:page-load", () => {
          window.__verifyAnchorsLoads += 1;
        });
        const link = document.createElement("a");
        link.href = route;
        link.textContent = "post";
        link.id = "verify-anchors-post";
        document.body.append(link);
      },
      { value: marker, route },
    );
    await page.locator("#verify-anchors-post").click();
    try {
      await page.waitForFunction(
        (route) =>
          location.pathname === route && window.__verifyAnchorsLoads >= 1,
        route,
        { timeout: WAIT_MS * 2 },
      );
    } catch {
      return [`client router did not bring up ${route} from /`];
    }
    await tab.settle().catch(() => {});
    const problems = [];
    if ((await page.evaluate(() => window.__verifyAnchors ?? null)) !== marker)
      return [`${route} was loaded as a new document, not swapped in`];
    const last = links.length - 1;
    problems.push(...(await clickProblems(page, links[last], last)));
    if ((await page.evaluate(() => window.__verifyAnchors ?? null)) !== marker)
      problems.push("the page was loaded again by a section link");
    return problems.map((problem) => `${route}: ${problem}`);
  });
}

export default {
  name: NAME,
  kind: "browser",
  scope: "feature",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, NAME);
    const failed = [];
    const cells = {};
    let pass = 0;

    const routes = candidateRoutes(ctx).filter(isPost);
    const base = await ctx.serve("candidate");
    // openBrowser serves both sides to know which origins are local. This check never reads the baseline (it also
    // runs under --feature, where there is none), so both sides are the candidate here.
    const browser = await openBrowser(
      Object.create(ctx, { serve: { value: () => ctx.serve("candidate") } }),
    );
    const record = (route, problems) => {
      if (problems.length === 0) {
        pass++;
        cells[route] = "pass";
        return;
      }
      const detail = problems.join("; ");
      if (skip(`route:${route}`, detail)) cells[route] = "skip";
      else {
        failed.push({ route, detail });
        cells[route] = "fail";
      }
    };

    try {
      const pages = await Promise.all(
        routes.map(async (route) => {
          const html = await ctx.html("candidate", route);
          if (html === null)
            return { problems: ["route missing in candidate"], links: [] };
          return staticProblems(html);
        }),
      );
      const outcomes = await mapLimit(routes, 2, async (route, index) => {
        const { problems, links } = pages[index];
        try {
          return [...problems, ...(await examine(browser, base, route, links))];
        } catch (error) {
          return [...problems, `could not examine: ${oneLine(error)}`];
        }
      });
      routes.forEach((route, index) => record(route, outcomes[index]));

      const index = pages.findIndex(({ links }) => links.length > 0);
      // A post without h2–h4 has nothing to link; the router item needs a post that has. None selected: no item.
      if (index !== -1) {
        let problems;
        try {
          problems = await routerProblems(
            browser,
            base,
            routes[index],
            pages[index].links,
          );
        } catch (error) {
          problems = [`could not examine: ${oneLine(error)}`];
        }
        if (problems.length === 0) pass++;
        else
          failed.push({ route: "-", detail: `router: ${problems.join("; ")}` });
      }
    } finally {
      await browser.close();
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { allowed },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "첫 글의 첫 h2 에서 섹션 링크를 벗긴다",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(
              /(<h2 id="[^"]*">)<a class="heading-link" href="[^"]*">([\s\S]*?)<\/a>(<\/h2>)/,
              "$1$2$3",
            ),
          );
        },
        routes: (dir) => [routeOfPage(postFiles(dir)[0])],
      },
      {
        name: "중복 제목(-1)의 섹션 링크가 첫 제목으로 간다",
        apply(dir) {
          const [route] = postRoutesWith(dir, REPEATED);
          mutateFile(dir, `${route.slice(1)}.html`, (html) =>
            html.replace(/(class="heading-link" href="#[^"]*)-1"/, '$1"'),
          );
        },
        // Found by the id, which the mutation leaves alone: routes() is read after apply().
        routes: (dir) => postRoutesWith(dir, REPEATED),
      },
      {
        name: "scroll-margin-top 이 음수라 제목이 화면 위로 숨는다",
        apply(dir) {
          editPages(
            dir,
            /scroll-margin-top:1\.5rem/g,
            "scroll-margin-top:-5rem",
          );
        },
        routes: (dir) => postRoutesWith(dir, /class="heading-link"/),
      },
      {
        name: "키보드 포커스 링을 없앤다",
        apply(dir) {
          editPages(
            dir,
            /(\.heading-link:focus-visible\{)outline:[^;}]*/g,
            "$1outline:none",
          );
        },
        routes: (dir) => postRoutesWith(dir, /class="heading-link"/),
      },
      {
        // A post the baseline does not have, as a pull request would add one: its section links have to be checked too.
        name: "기준선에 없는 새 글 페이지의 섹션 링크를 모두 벗긴다",
        apply(dir) {
          addPage(dir, postFiles(dir)[0], (html) =>
            html.replace(
              /<a class="heading-link" href="[^"]*">([\s\S]*?)<\/a>(<\/h[234]>)/g,
              "$1$2",
            ),
          );
        },
        routes: [NEW_PAGE.route],
      },
    ],
  },
};
