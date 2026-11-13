// interactions — the copy buttons of the code blocks and the scroll spy of the table of contents work in a browser.
// Candidate-only (scope "feature"): the baseline has neither.
//
// For every post route of the candidate ("/posts/<id>"), in Chromium at 1280×900 with clipboard permissions granted,
// one page at a time (the clipboard is the browser's) and with every <details> inside <main> opened:
//   buttons     every pre.astro-code of the served HTML has exactly one button inside it whose accessible name is
//               "복사", and there are no other buttons named "복사".
//   click       clicking the button of each block (clipboard emptied first) renames it "복사됨" and leaves exactly the
//               block's text in the clipboard. "The block's text" is the textContent of the <pre> in the served HTML,
//               read with cheerio, so it does not depend on what the page script does to the block.
//   keyboard    on the first block: clipboard emptied, focus on the button, Enter → the same text in the clipboard.
//   scroll spy  when the page has <nav aria-label="목차">: each body heading its links point at is scrolled to the top
//               of the viewport (instant). A heading that got there (|top| < 2px) and whose next toc heading is at
//               least half a viewport below it is "the heading in view": its toc link, and no other, must then carry
//               aria-current="true". A toc where no heading qualifies is a failure (nothing was examined).
// One item per route, listing every problem. Routes without code blocks or toc pass on "buttons" alone.
//
// Allowlist item: "route:<route>".
import fs from "node:fs";
import path from "node:path";

import { load } from "cheerio";

import { mapLimit, openBrowser } from "../lib/browser.mjs";
import {
  NEW_PAGE,
  addPage,
  allowances,
  candidateRoutes,
  listFiles,
  postFiles,
  postRoutesWith,
  quote,
} from "../lib/html.mjs";

const NAME = "interactions";
const VIEWPORT = { width: 1280, height: 900 };
const IDLE = "복사";
const DONE = "복사됨";
const TOC = 'nav[aria-label="목차"]';
/** How long a click, a key press or a scroll may take to show. Only spent when it does not. */
const WAIT_MS = 3_000;

const isPost = (route) => /^\/posts\/[^/]+$/.test(route);
const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

/** Scroll heading `id` to the top; → { top, gap } (gap: px down to the next toc heading, Infinity for the last). */
function scrollToHeading({ id, nextId }) {
  const heading = document.getElementById(id);
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
}

/** hrefs of the toc links that carry aria-current="true". */
function currentLinks(selector) {
  return Array.from(
    document.querySelectorAll(`${selector} a[aria-current="true"]`),
    (link) => link.getAttribute("href"),
  );
}

// ── one route ───────────────────────────────────────────────────────────────────────────────────

async function examine(browser, base, route, html) {
  const $ = load(html);
  const blocks = $("pre.astro-code")
    .toArray()
    .map((el) => $(el).text());
  const tocLinks = $(TOC)
    .find("a")
    .toArray()
    .map((el) => el.attribs.href ?? "")
    .filter((href) => href.startsWith("#"));

  return browser.withPage(VIEWPORT, async (tab) => {
    const { page } = tab;
    const url = new URL(route, base).href;
    await page
      .context()
      .grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(base).origin,
      });
    const status = await tab.open(url);
    if (status !== 200) return [`HTTP ${status}`];
    const problems = [];

    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    const clear = () => page.evaluate(() => navigator.clipboard.writeText(""));
    const waitClipboard = async (expected) => {
      const until = Date.now() + WAIT_MS;
      let text = await clipboard();
      while (text !== expected && Date.now() < until) {
        await page.waitForTimeout(50);
        text = await clipboard();
      }
      return text;
    };

    // A code block inside a closed <details> of the post has a button too, hidden until it is opened.
    await page.evaluate(() => {
      for (const details of document.querySelectorAll("main details"))
        details.open = true;
    });

    // buttons
    const pres = page.locator("pre.astro-code");
    const shown = await pres.count();
    if (shown !== blocks.length)
      problems.push(
        `${shown} pre.astro-code in the page, ${blocks.length} in the HTML`,
      );
    const named = await page
      .getByRole("button", { name: IDLE, exact: true })
      .count();
    if (named !== blocks.length)
      problems.push(
        `${named} buttons named "${IDLE}" for ${blocks.length} code blocks`,
      );

    // click, keyboard
    for (let i = 0; i < Math.min(shown, blocks.length); i++) {
      const button = pres
        .nth(i)
        .getByRole("button", { name: IDLE, exact: true });
      if ((await button.count()) !== 1) {
        problems.push(`code block ${i + 1} has no button named "${IDLE}"`);
        continue;
      }
      await clear();
      await button.click();
      const done = pres.nth(i).getByRole("button", { name: DONE, exact: true });
      try {
        await done.waitFor({ timeout: WAIT_MS });
      } catch {
        problems.push(`code block ${i + 1}: button not renamed "${DONE}"`);
      }
      const text = await waitClipboard(blocks[i]);
      if (text !== blocks[i])
        problems.push(
          `code block ${i + 1}: clipboard ${quote(text, 40)} ≠ block ${quote(blocks[i], 40)}`,
        );

      if (i === 0) {
        await clear();
        await pres.nth(0).getByRole("button").first().focus();
        await page.keyboard.press("Enter");
        const typed = await waitClipboard(blocks[0]);
        if (typed !== blocks[0])
          problems.push(
            `code block 1 by keyboard (Enter): clipboard ${quote(typed, 40)} ≠ block`,
          );
      }
    }

    // scroll spy
    if (tocLinks.length > 0) {
      let examined = 0;
      for (let i = 0; i < tocLinks.length; i++) {
        const href = tocLinks[i];
        const id = decode(href.slice(1));
        const nextId = tocLinks[i + 1] ? decode(tocLinks[i + 1].slice(1)) : "";
        const where = await page.evaluate(scrollToHeading, { id, nextId });
        if (Math.abs(where.top) >= 2 || where.gap < where.viewport / 2)
          continue;
        examined++;
        try {
          await page.waitForFunction(
            ({ selector, href }) => {
              const links = Array.from(
                document.querySelectorAll(`${selector} a[aria-current="true"]`),
                (link) => link.getAttribute("href"),
              );
              return links.length === 1 && links[0] === href;
            },
            { selector: TOC, href },
            { timeout: WAIT_MS, polling: "raf" },
          );
        } catch {
          const current = await page.evaluate(currentLinks, TOC);
          problems.push(
            `heading ${href} at the top: aria-current on [${current.join(", ")}], expected [${href}]`,
          );
        }
      }
      if (examined === 0)
        problems.push(
          `no heading of the toc (${tocLinks.length}) could be scrolled to the top with the next one half a viewport below`,
        );
    }

    if (tab.failures.length)
      problems.push(`unserved requests: ${tab.failures.join(", ")}`);
    return problems;
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
    let outcomes;
    try {
      // One page at a time: the clipboard belongs to the browser, not to a page.
      outcomes = await mapLimit(routes, 1, async (route) => {
        const html = await ctx.html("candidate", route);
        if (html === null) return ["route missing in candidate"];
        try {
          return await examine(browser, base, route, html);
        } catch (error) {
          return [`could not examine: ${oneLine(error)}`];
        }
      });
    } finally {
      await browser.close();
    }

    routes.forEach((route, index) => {
      const problems = outcomes[index];
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
    });

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
    // Applied to a copy of dist/ (scope "feature"). The page scripts are inlined into every post page; an edit to
    // the pages (and to _astro/*.js, should a script ever be emitted as a file) is what the browser runs.
    mutations: [
      {
        name: "복사하는 글자를 바꾼다(끝에 공백 하나)",
        apply(dir) {
          editScripts(
            dir,
            /navigator\.clipboard\.writeText\(([A-Za-z_$][\w$]*)\)/g,
            'navigator.clipboard.writeText($1+" ")',
          );
        },
        routes: (dir) => postRoutesWith(dir, /class="astro-code/),
      },
      {
        name: "스크롤 스파이가 aria-current 대신 다른 속성을 단다",
        apply(dir) {
          editScripts(dir, /`aria-current`/g, "`data-current`");
        },
        routes: (dir) => postRoutesWith(dir, /aria-label="목차"/),
      },
      {
        name: "복사가 끝나도 버튼 이름이 그대로다",
        apply(dir) {
          editScripts(dir, /`복사됨`/g, "`복사`");
        },
        routes: (dir) => postRoutesWith(dir, /class="astro-code/),
      },
      {
        // A post the baseline does not have, as a pull request would add one: its buttons have to be checked too.
        name: "기준선에 없는 새 글 페이지의 복사 버튼 스크립트 삭제",
        apply(dir) {
          const from = postFiles(dir).find((rel) =>
            /class="astro-code/.test(
              fs.readFileSync(path.join(dir, rel), "utf8"),
            ),
          );
          // Inline, or (since S7.2's CSP keeps every script in a file) <script src="/_astro/CopyCode….js">.
          addPage(dir, from, (html) =>
            html.replace(
              /<script type="module">[^<]*customElements\.define\(`copy-code`[^<]*<\/script>|<script type="module" src="\/_astro\/CopyCode\.[^"]*"><\/script>/,
              "",
            ),
          );
        },
        routes: [NEW_PAGE.route],
      },
    ],
  },
};

/** Self-test: apply `pattern → replacement` to every page and script file of a site copy. Throws when nothing matched. */
function editScripts(dir, pattern, replacement) {
  let edited = 0;
  for (const rel of listFiles(dir)) {
    if (!/\.(html|js)$/.test(rel)) continue;
    const file = path.join(dir, rel);
    const before = fs.readFileSync(file, "utf8");
    const after = before.replace(pattern, replacement);
    if (after === before) continue;
    fs.writeFileSync(file, after);
    edited++;
  }
  if (edited === 0)
    throw new Error(`mutation did not apply: ${pattern} in no file of ${dir}`);
}
