// theme — dark mode (S6.1): the page is in its theme before the first paint, the saved choice wins over the
// system's, every route is readable in dark, and the toggle flips, persists and drives the comments widget.
//
//   npm run verify -- --only=theme --route=/
//
// The new build alone is looked at (scope "feature"); the old site has no dark mode to compare with. Every
// page opens in a fresh browser context, so nothing is saved unless a step saves it. Requests leaving the site
// are aborted: a theme never depends on GA, utterances or a remote image.
//
// Items, each one line of the report:
//   first-paint   every route, system dark, nothing saved, deferred scripts kept from running (script files are
//                 aborted and <script type="module"> elements, which Astro inlines, are cut from the document):
//                 <html data-theme="dark"> is there when <body> is parsed (every <head> script has run then,
//                 nothing has been painted yet), and at the load event (stylesheets in, no deferred script having
//                 run) the canvas, the computed background of <html>, is dark. A theme set by a deferred script or
//                 by a script at the end of <body> is a flash of the light page.
//   contrast      every route, system dark, scripts running: axe-core `color-contrast` reports 0 violations.
//   saved         one route (/ when selected): saved "light" under system dark → light at first paint, and
//                 saved "dark" under system light → dark at first paint.
//   toggle        the same route, system light: one <button> with a Korean aria-label and aria-pressed="false";
//                 Enter on it (keyboard) → data-theme="dark", aria-pressed="true", localStorage theme=dark; a reload
//                 starts dark with aria-pressed="true"; Space flips it back and that, too, survives a reload.
//   utterances    the first selected post with the utteranc.es client script, system dark: the script's theme
//                 attribute is github-dark; toggling to light posts {type:"set-theme",theme:"boxy-light"} to an
//                 iframe.utterances-frame for https://utteranc.es and sets the attribute to boxy-light.
//
// Storage key and values: localStorage "theme" = "light" | "dark".
import fs from "node:fs";
import path from "node:path";

import { mapLimit, MAX_PAGES } from "../lib/browser.mjs";
import {
  addPage,
  candidateRoutes,
  editPages,
  NEW_PAGE,
  postRoutesWith,
} from "../lib/html.mjs";

const NAME = "theme";
const VIEWPORT = { width: 1280, height: 900 };
const KEY = "theme";
const TOGGLE = "button.theme-toggle";
const UTTERANCES = 'script[src^="https://utteranc.es/client.js"]';
const UTTERANCES_THEMES = { light: "boxy-light", dark: "github-dark" };
const TIMEOUT_MS = 15_000;
const MODULE_SCRIPT = /<script\b[^>]*\btype="module"[^>]*>[\s\S]*?<\/script>/g;

const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

/**
 * Runs before any script of the page (context init script). Records the theme when <body> is first in the
 * document (every <head> script that blocks parsing has run by then) and the canvas at the load event, when
 * the stylesheets have arrived: the site's <link rel="stylesheet"> comes last in <head>, so DOMContentLoaded
 * can come before the styles.
 */
function recordFirstPaint() {
  window.__verifyTheme = { body: undefined, loaded: undefined };
  const theme = () => document.documentElement.getAttribute("data-theme");
  new MutationObserver((_records, observer) => {
    if (!document.body) return;
    window.__verifyTheme.body = theme();
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
  addEventListener("load", () => {
    window.__verifyTheme.loaded = {
      theme: theme(),
      canvas: getComputedStyle(document.documentElement).backgroundColor,
    };
  });
}

/** Relative luminance (WCAG) of a computed "rgb(…)"/"rgba(…)" colour; null when transparent or unreadable. */
function luminance(color) {
  const match = /rgba?\(([^)]+)\)/.exec(color ?? "");
  if (!match) return null;
  const [r, g, b, a = 1] = match[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (a === 0) return null;
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** "dark" | "light" | "none" (transparent canvas) from a computed background colour. */
function shade(color) {
  const value = luminance(color);
  if (value === null) return "none";
  return value < 0.2 ? "dark" : "light";
}

// ── browser ─────────────────────────────────────────────────────────────────────────────────────

async function launch(ctx) {
  const origin = new URL(await ctx.serve("candidate")).origin;
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  /**
   * fn(page, context) in a fresh context. `scripts: false` lets only classic inline scripts run: script files
   * are aborted and module scripts are cut from the documents.
   */
  async function withContext({ colorScheme, scripts = true }, fn) {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: "ko-KR",
      timezoneId: "Asia/Seoul",
      reducedMotion: "reduce",
      colorScheme,
      serviceWorkers: "block",
    });
    try {
      await context.addInitScript(recordFirstPaint);
      await context.route("**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin) return route.abort("blockedbyclient");
        if (scripts) return route.continue();
        if (request.resourceType() === "script")
          return route.abort("blockedbyclient");
        if (request.resourceType() === "document") {
          const response = await route.fetch();
          const body = (await response.text()).replace(MODULE_SCRIPT, "");
          return route.fulfill({ response, body });
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(TIMEOUT_MS);
      return await fn(page, context);
    } finally {
      await context.close().catch(() => {});
    }
  }

  return { origin, withContext, close: () => browser.close() };
}

async function open(page, url, route) {
  const response = await page.goto(url, { waitUntil: "load" });
  const status = response ? response.status() : 0;
  if (status >= 400 && route !== "/404") throw new Error(`HTTP ${status}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function reload(page) {
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

const firstPaint = (page) => page.evaluate(() => window.__verifyTheme);

/** Problems of the first paint against the theme `expected`. */
function paintProblems(recorded, expected) {
  const problems = [];
  if (recorded?.body !== expected)
    problems.push(
      `data-theme when <body> was parsed: ${JSON.stringify(recorded?.body ?? null)}, expected "${expected}"`,
    );
  const canvas = recorded?.loaded?.canvas;
  if (shade(canvas) !== expected)
    problems.push(
      `canvas at load is ${canvas ?? "unknown"} (${shade(canvas)}), expected ${expected}`,
    );
  return problems;
}

// ── items ───────────────────────────────────────────────────────────────────────────────────────

async function checkFirstPaint(browser, url, route) {
  return browser.withContext(
    { colorScheme: "dark", scripts: false },
    async (page) => {
      await open(page, url, route);
      return paintProblems(await firstPaint(page), "dark");
    },
  );
}

async function checkContrast(browser, url, route, AxeBuilder) {
  return browser.withContext({ colorScheme: "dark" }, async (page) => {
    await open(page, url, route);
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme"),
    );
    if (theme !== "dark") return [`data-theme is ${theme}, expected dark`];
    const { violations } = await new AxeBuilder({ page })
      .withRules(["color-contrast"])
      .analyze();
    return violations.flatMap((violation) =>
      violation.nodes.map(
        (node) =>
          `color-contrast ${node.target.join(" >> ")}${
            node.any?.[0]?.message ? ` (${node.any[0].message})` : ""
          }`,
      ),
    );
  });
}

async function checkSaved(browser, url, route) {
  const problems = [];
  for (const [system, saved] of [
    ["dark", "light"],
    ["light", "dark"],
  ]) {
    await browser.withContext({ colorScheme: system }, async (page) => {
      await open(page, url, route);
      await page.evaluate(
        ([key, value]) => localStorage.setItem(key, value),
        [KEY, saved],
      );
      await reload(page);
      for (const problem of paintProblems(await firstPaint(page), saved))
        problems.push(`saved ${saved}, system ${system}: ${problem}`);
    });
  }
  return problems;
}

async function checkToggle(browser, url, route) {
  return browser.withContext({ colorScheme: "light" }, async (page) => {
    await open(page, url, route);
    const problems = [];
    const state = () =>
      page.evaluate(
        ([selector, key]) => {
          const buttons = document.querySelectorAll(selector);
          const button = buttons[0];
          let saved = null;
          try {
            saved = localStorage.getItem(key);
          } catch {
            saved = "<unreadable>";
          }
          return {
            count: buttons.length,
            tag: button?.localName ?? null,
            type: button?.getAttribute("type") ?? null,
            label: button?.getAttribute("aria-label") ?? null,
            pressed: button?.getAttribute("aria-pressed") ?? null,
            theme: document.documentElement.getAttribute("data-theme"),
            saved,
          };
        },
        [TOGGLE, KEY],
      );
    const expect = (step, actual, wanted) => {
      for (const [field, value] of Object.entries(wanted))
        if (actual[field] !== value)
          problems.push(
            `${step}: ${field} is ${JSON.stringify(actual[field])}, expected ${JSON.stringify(value)}`,
          );
    };

    const start = await state();
    if (start.count !== 1) return [`${start.count} ${TOGGLE} on the page`];
    if (!/[가-힣]/.test(start.label ?? ""))
      problems.push(
        `aria-label ${JSON.stringify(start.label)} is not Korean text`,
      );
    expect("before", start, { theme: "light", pressed: "false" });

    // Keyboard only: a <div role=button> with a click handler would not answer Enter or Space.
    await page.focus(TOGGLE);
    await page.keyboard.press("Enter");
    expect("after Enter", await state(), {
      theme: "dark",
      pressed: "true",
      saved: "dark",
    });
    await reload(page);
    problems.push(
      ...paintProblems(await firstPaint(page), "dark").map(
        (problem) => `after reload: ${problem}`,
      ),
    );
    expect("after reload", await state(), { theme: "dark", pressed: "true" });

    await page.focus(TOGGLE);
    await page.keyboard.press("Space");
    expect("after Space", await state(), {
      theme: "light",
      pressed: "false",
      saved: "light",
    });
    await reload(page);
    problems.push(
      ...paintProblems(await firstPaint(page), "light").map(
        (problem) => `after second reload: ${problem}`,
      ),
    );
    expect("after second reload", await state(), {
      theme: "light",
      pressed: "false",
    });
    return problems;
  });
}

async function checkUtterances(browser, url, route) {
  return browser.withContext({ colorScheme: "dark" }, async (page) => {
    await open(page, url, route);
    const problems = [];
    const before = await page.getAttribute(UTTERANCES, "theme");
    if (before !== UTTERANCES_THEMES.dark)
      problems.push(
        `utterances theme in dark is ${JSON.stringify(before)}, expected ${UTTERANCES_THEMES.dark}`,
      );

    // utteranc.es is blocked: stand in for its iframe and listen to what the page posts to it.
    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.className = "utterances-frame";
      document.body.append(frame);
      window.__verifyPosted = [];
      frame.contentWindow.postMessage = (message, origin) =>
        window.__verifyPosted.push({ message, origin });
    });
    await page.click(TOGGLE);
    const posted = await page.evaluate(() => window.__verifyPosted);
    const wanted = posted.some(
      ({ message, origin }) =>
        origin === "https://utteranc.es" &&
        message?.type === "set-theme" &&
        message?.theme === UTTERANCES_THEMES.light,
    );
    if (!wanted)
      problems.push(
        `toggling to light posted ${JSON.stringify(posted)}, expected {type:"set-theme",theme:"${UTTERANCES_THEMES.light}"} for https://utteranc.es`,
      );
    const after = await page.getAttribute(UTTERANCES, "theme");
    if (after !== UTTERANCES_THEMES.light)
      problems.push(
        `utterances theme after toggling is ${JSON.stringify(after)}, expected ${UTTERANCES_THEMES.light}`,
      );
    return problems;
  });
}

// ── the check ───────────────────────────────────────────────────────────────────────────────────

async function run(ctx) {
  const { AxeBuilder } = await import("@axe-core/playwright");
  const routes = candidateRoutes(ctx);
  const routeHtml = (route) => {
    const file = ctx.fileFor("candidate", route);
    return file && fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  };
  const single = routes.includes("/") ? "/" : routes[0];
  const commented = routes.find(
    (route) =>
      route.startsWith("/posts/") && routeHtml(route).includes("utteranc.es"),
  );

  const jobs = [
    ...routes.map((route) => ({ item: "first-paint", route })),
    ...routes.map((route) => ({ item: "contrast", route })),
  ];
  if (single !== undefined)
    jobs.push(
      { item: "saved", route: single },
      { item: "toggle", route: single },
    );
  if (commented !== undefined)
    jobs.push({ item: "utterances", route: commented });

  const browser = await launch(ctx);
  let outcomes;
  try {
    const base = await ctx.serve("candidate");
    outcomes = await mapLimit(jobs, MAX_PAGES, async ({ item, route }) => {
      const url = base + route;
      let problems;
      try {
        if (item === "first-paint")
          problems = await checkFirstPaint(browser, url, route);
        else if (item === "contrast")
          problems = await checkContrast(browser, url, route, AxeBuilder);
        else if (item === "saved")
          problems = await checkSaved(browser, url, route);
        else if (item === "toggle")
          problems = await checkToggle(browser, url, route);
        else problems = await checkUtterances(browser, url, route);
      } catch (error) {
        problems = [`crashed: ${oneLine(error)}`];
      }
      return { item, route, ok: problems.length === 0, problems };
    });
  } finally {
    await browser.close();
  }

  const failed = outcomes
    .filter((outcome) => !outcome.ok)
    .map(({ item, route, problems }) => ({
      route,
      detail: `${item}: ${problems.slice(0, 3).join("; ")}${problems.length > 3 ? `; +${problems.length - 3} more` : ""}`,
    }));
  const cells = {};
  for (const outcome of outcomes)
    if (cells[outcome.route] !== "fail")
      cells[outcome.route] = outcome.ok ? "pass" : "fail";

  return {
    ok: failed.length === 0,
    pass: outcomes.length - failed.length,
    fail: failed.length,
    failed,
    cells,
    extra: { outcomes },
  };
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────────

// The theme script in <head> is the inline one that reads the saved choice. Moving it to the end of <body>
// keeps every behaviour but the timing: the light page is painted first.
const HEAD_SCRIPT = /<script>\(function\(\)\{[^<]*?themeKey[\s\S]*?<\/script>/;

/** The head theme script and everything after it up to </body>: "$2$1</body>" moves the script to the end. */
const UP_TO_BODY_END = new RegExp(`(${HEAD_SCRIPT.source})([\\s\\S]*)</body>`);
const deferThemeScript = (html) => html.replace(UP_TO_BODY_END, "$2$1</body>");

/** Apply `pattern → replacement` to every stylesheet under dir/_astro. Throws when nothing matched. */
function editStylesheets(dir, pattern, replacement) {
  const assets = path.join(dir, "_astro");
  let edited = 0;
  for (const name of fs.readdirSync(assets)) {
    if (!name.endsWith(".css")) continue;
    const file = path.join(assets, name);
    const before = fs.readFileSync(file, "utf8");
    const after = before.replace(pattern, replacement);
    if (after === before) continue;
    fs.writeFileSync(file, after);
    edited += 1;
  }
  if (edited === 0)
    throw new Error(
      `mutation did not apply: ${pattern} not found in ${assets}`,
    );
}

export default {
  name: NAME,
  kind: "browser",
  scope: "feature",
  run,

  selftest: {
    mutations: [
      {
        name: "head 의 테마 스크립트를 body 끝으로 옮김(첫 화면이 밝게 칠해짐)",
        routes: ["/"],
        apply(dir) {
          editPages(dir, UP_TO_BODY_END, "$2$1</body>");
        },
      },
      {
        name: "기준선에 없는 새 글에서만 테마 스크립트를 body 끝으로 옮김",
        routes: [NEW_PAGE.route],
        apply(dir) {
          const [route] = postRoutesWith(dir, HEAD_SCRIPT);
          addPage(dir, `${route.slice(1)}.html`, deferThemeScript);
        },
      },
      {
        name: "저장된 선택을 읽지 않음(시스템 설정만 따름)",
        routes: ["/"],
        apply(dir) {
          editPages(dir, /localStorage\.getItem\(themeKey\)/g, "null");
        },
      },
      {
        name: "다크 본문 글자색을 배경과 비슷하게(대비 부족)",
        routes: ["/"],
        apply(dir) {
          editStylesheets(
            dir,
            /(\[data-theme=dark\]\{[^}]*--color-text:)#[0-9a-f]+/g,
            "$1#30363d",
          );
        },
      },
      {
        name: "토글이 선택을 저장하지 않음(새로 고치면 되돌아감)",
        routes: ["/"],
        apply(dir) {
          editPages(
            dir,
            /localStorage\.setItem\(themeKey,\s*theme\)/g,
            "void 0",
          );
        },
      },
      {
        name: "토글이 <button> 이 아님(키보드로 누를 수 없음)",
        routes: ["/"],
        apply(dir) {
          editPages(
            dir,
            /<button([^>]*class="theme-toggle[^>]*)>([\s\S]*?)<\/button>/g,
            '<div role="button"$1>$2</div>',
          );
        },
      },
      {
        name: "utterances 에 테마를 알리지 않음",
        routes: (dir) => postRoutesWith(dir, /utteranc\.es\/client\.js/),
        apply(dir) {
          editPages(dir, /"set-theme"/g, '"no-theme"');
        },
      },
    ],
  },
};
