// comments — inline comments (CM): every post carries the comments section, the site has nothing of utterances left,
// and in a browser a reader can comment on a sentence, see it highlighted after a reload and a client-side round trip,
// comment on the whole post, find a comment whose sentence is gone, and lose nothing but the section when the API is
// down.
//
//   npm run verify -- --only=comments --route=/posts/<id>
//
// Candidate-only (scope "feature"): the old site has utterances. The contract the client follows (CM-B):
//   <post-comments data-api="<API base>" data-post="<post id>" hidden>   after the post body (<main>), on posts only
//   the loader                 GET {API}/v1/posts/<post id>/threads; on failure (or after 4s) the section stays hidden
//   the highlight              CSS Custom Highlight API, registry name "comments" (CSS.highlights.get("comments"))
//   the selection button       a <button> named "선택한 글에 댓글 달기" once a sentence of the body is selected
//   the panel                  aside[aria-label="댓글"], with a <form> holding a <textarea> for the selected sentence
//   the post-level form        a <form> with a <textarea> inside <post-comments>, outside the panel
//   the orphan list            a heading "원문을 찾을 수 없는 댓글" whose section lists the comments it holds
//   the token                  localStorage "comments-token", sent as Authorization: Bearer <token>
//
// The API is the real worker (comments/), run locally: `wrangler d1 migrations apply` and `wrangler dev --env test`
// on a fresh temporary D1 (--persist-to), ALLOWED_ORIGINS set to the origin that serves dist/. The production API
// origin (from data-api) is routed to it with Playwright, so dist/ is checked exactly as built. A reader is logged in
// with POST /v1/auth/test-login (TEST_LOGIN=1 in the test env) and the token put in localStorage before the page runs.
// Every other off-site request is aborted.
//
// Items, each one line of the report:
//   markup      every selected route, from the HTML: no "utteranc.es"; a post has exactly one <post-comments> with
//               an https data-api, data-post equal to its id and the hidden attribute, after <main> and not inside
//               it; any other page has none. All pages name the same data-api.
//   assets      every text file of the build (html, js, css, xml, json, …): no "utteranc.es".
//   The scenario, on post P (the first post linked from "/" that has <post-comments>, selected routes first), system
//   light, 1280×900:
//   load        a full load requests the threads of P once, and the section is shown (hidden removed) once it has
//               them.
//   select      a phrase of a body paragraph, unique in <main>, selected with the mouse: a button named
//               "선택한 글에 댓글 달기" shows up.
//   write       focus on that button, Enter (keyboard): aside[aria-label="댓글"] shows up; its <textarea>'s form
//               submitted → POST {API}/v1/posts/P/threads answered 201, sent with Authorization: Bearer <token> and
//               anchor.exact equal to the selected phrase; the panel then shows the comment.
//   highlight   CSS.highlights.get("comments") holds exactly one range, and its text is the phrase.
//   contrast    axe-core color-contrast inside the open panel: 0 violations with data-theme "light" and "dark" (set
//               directly: a click on the toggle may close the panel).
//   reload      after a reload the threads are requested again and the one range is back.
//   away        a client-side navigation (<ClientRouter />) to "/": no <post-comments>, no panel, no selection
//               button, no range left in the "comments" highlight.
//   back        a client-side navigation back to P: the threads requested again, one <post-comments>, exactly one
//               range with the phrase (not two: the old page's state is gone, the new one restored once).
//   post-level  the form inside <post-comments> (outside the panel) submitted → POST answered 201 without an anchor;
//               the comment shows inside <post-comments>; still one range.
//   orphan      quote_exact of the thread changed in D1 (wrangler d1 execute) and the page reloaded: a heading
//               "원문을 찾을 수 없는 댓글" whose section holds the first comment, and no range left.
//   clean       across the scenario: no request to utteranc.es, no securitypolicyviolation, no console error, no
//               uncaught exception.
//   down:abort, down:503, down:timeout   P in a fresh context with the API refused, answering 503, or never
//               answering: the threads are requested, <post-comments> is hidden (within the 4s timeout + 3s) and
//               stays hidden, no panel or selection button, no securitypolicyviolation, no console error (the
//               browser's own "Failed to load resource" line for the API request aside), no uncaught exception.
//
// Allowlist: none.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { load } from "cheerio";

import { commentsApiOrigins, mapLimit } from "../lib/browser.mjs";
import {
  addPage,
  candidateRoutes,
  editPages,
  listFiles,
  NEW_PAGE,
  postFiles,
  postRoutesWith,
  quote,
} from "../lib/html.mjs";
import { repoRoot } from "../lib/paths.mjs";

const NAME = "comments";
const VIEWPORT = { width: 1280, height: 900 };
const TAG = "post-comments";
const HIGHLIGHT = "comments";
const SELECT_BUTTON = "선택한 글에 댓글 달기";
const PANEL = 'aside[aria-label="댓글"]';
const ORPHANS = "원문을 찾을 수 없는 댓글";
const TOKEN_KEY = "comments-token";
const UTTERANCES = "utteranc.es";
/** How long something the page does may take to show. Only spent when it does not. */
const WAIT_MS = 5_000;
/** The loader gives up after 4s; the section must be hidden by then, with this much slack. */
const DOWN_WAIT_MS = 4_000 + 3_000;
const WORKER_START_MS = 60_000;
const TEXT_FILES = /\.(html|js|mjs|css|xml|json|txt|svg|webmanifest)$/;
const META =
  /<meta\b[^>]*\bhttp-equiv=["']?content-security-policy["']?[^>]*>/gi;

const isPost = (route) => /^\/posts\/[^/]+$/.test(route);
const postIdOf = (route) => route.slice("/posts/".length);
const oneLine = (error) => String(error?.message ?? error).split("\n")[0];
const threadsPath = (post) => `/v1/posts/${post}/threads`;

// ── the HTML ────────────────────────────────────────────────────────────────────────────────────

/** Problems of one page's HTML, and the data-api it names (or null). */
function markupProblems(route, html) {
  const problems = [];
  if (html.includes(UTTERANCES)) problems.push(`"${UTTERANCES}" in the page`);
  const $ = load(html);
  const sections = $(TAG).toArray();
  if (!isPost(route)) {
    if (sections.length)
      problems.push(`${sections.length} <${TAG}> on a page that is not a post`);
    return { problems, api: null };
  }
  if (sections.length !== 1) {
    problems.push(`${sections.length} <${TAG}>, expected 1`);
    return { problems, api: null };
  }
  const section = $(sections[0]);
  const api = section.attr("data-api") ?? null;
  let apiUrl = null;
  try {
    apiUrl = api === null ? null : new URL(api);
  } catch {
    // reported below
  }
  if (!apiUrl || apiUrl.protocol !== "https:")
    problems.push(`data-api ${quote(api)} is not an https URL`);
  if (section.attr("data-post") !== postIdOf(route))
    problems.push(
      `data-post ${quote(section.attr("data-post"))}, expected ${quote(postIdOf(route))}`,
    );
  if (section.attr("hidden") === undefined)
    problems.push(
      `<${TAG}> without the hidden attribute (shown before the API answered)`,
    );
  const main = $("main").toArray();
  if (main.length !== 1) problems.push(`${main.length} <main>, expected 1`);
  else {
    const order = $("*").toArray();
    if (section.closest("main").length)
      problems.push(`<${TAG}> is inside <main> (the post body)`);
    else if (order.indexOf(sections[0]) < order.indexOf(main[0]))
      problems.push(`<${TAG}> comes before <main> (the post body)`);
  }
  return { problems, api };
}

// ── the worker ──────────────────────────────────────────────────────────────────────────────────

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const WRANGLER_ENV = {
  ...process.env,
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  NO_COLOR: "1",
};

const wrangler = (args) => [
  "-w",
  "comments",
  "exec",
  "--",
  "wrangler",
  ...args,
];

/** The comments worker on a fresh local D1, answering for `siteOrigin`. → { url, sql(text), stop() } */
async function startWorker(siteOrigin) {
  const persist = fs.mkdtempSync(path.join(os.tmpdir(), "verify-comments-"));
  const d1 = ["--local", "--env", "test", "--persist-to", persist];
  const migrate = spawnSync(
    "npm",
    wrangler(["d1", "migrations", "apply", "DB", ...d1]),
    { cwd: repoRoot, env: WRANGLER_ENV, encoding: "utf8" },
  );
  if (migrate.status !== 0) {
    fs.rmSync(persist, { recursive: true, force: true });
    throw new Error(
      `wrangler d1 migrations apply failed: ${(migrate.stderr || migrate.stdout || "").trim().split("\n").slice(-2).join(" ⏎ ")}`,
    );
  }

  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(
    "npm",
    wrangler([
      "dev",
      "--env",
      "test",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      persist,
      "--var",
      `ALLOWED_ORIGINS:${siteOrigin}`,
    ]),
    {
      cwd: repoRoot,
      env: WRANGLER_ENV,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let log = "";
  const keep = (chunk) => {
    log = (log + chunk).slice(-4000);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  let exited = null;
  const done = new Promise((resolve) =>
    child.on("exit", (code) => {
      exited = code ?? -1;
      resolve();
    }),
  );

  const stop = async () => {
    if (exited === null) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // gone already
      }
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // gone already
        }
      }, 5_000);
      await done;
      clearTimeout(timer);
    }
    fs.rmSync(persist, { recursive: true, force: true });
  };

  const deadline = Date.now() + WORKER_START_MS;
  for (;;) {
    if (exited !== null) {
      await stop();
      throw new Error(
        `wrangler dev exited (${exited}): ${log.trim().split("\n").slice(-2).join(" ⏎ ")}`,
      );
    }
    try {
      const response = await fetch(`${url}/v1/health`);
      if (response.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(
        `wrangler dev did not answer /v1/health within ${WORKER_START_MS / 1000}s: ${log.trim().split("\n").slice(-2).join(" ⏎ ")}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return {
    url,
    /** Run SQL on the worker's local D1 (the one wrangler dev serves). */
    sql(command) {
      const result = spawnSync(
        "npm",
        wrangler(["d1", "execute", "DB", ...d1, "--command", command]),
        { cwd: repoRoot, env: WRANGLER_ENV, encoding: "utf8" },
      );
      if (result.status !== 0)
        throw new Error(
          `wrangler d1 execute failed: ${(result.stderr || result.stdout || "").trim().split("\n").slice(-2).join(" ⏎ ")}`,
        );
      return result.stdout;
    },
    stop,
  };
}

async function testLogin(worker) {
  const response = await fetch(`${worker.url}/v1/auth/test-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: 1001, login: "verify-reader" }),
  });
  if (!response.ok)
    throw new Error(`POST /v1/auth/test-login answered ${response.status}`);
  const { token } = await response.json();
  if (typeof token !== "string" || !token)
    throw new Error("POST /v1/auth/test-login gave no token");
  return token;
}

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

/** Before any script of the page: CSP violations and client-side navigations. */
function recordPage({ key, token }) {
  window.__verifyComments = { violations: [], loads: 0 };
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__verifyComments.violations.push(
      `${event.effectiveDirective || event.violatedDirective} blocked ${event.blockedURI || "?"}`,
    );
  });
  document.addEventListener("astro:page-load", () => {
    window.__verifyComments.loads += 1;
  });
  if (token) localStorage.setItem(key, token);
}

/** The text of every range in the highlight registry entry `name` (null: no entry). */
function highlightTexts(name) {
  const highlight = CSS.highlights.get(name);
  if (!highlight) return null;
  return Array.from(highlight, (range) => {
    const live = document.createRange();
    live.setStart(range.startContainer, range.startOffset);
    live.setEnd(range.endContainer, range.endOffset);
    return live.toString();
  });
}

/**
 * A phrase of a body paragraph that occurs once in <main>, on one line of one text node, scrolled into view.
 * → { text, from, to } (points just inside its first and last characters) or null.
 */
function pickPhrase() {
  const main = document.querySelector("main");
  if (!main) return null;
  const whole = main.textContent;
  for (const paragraph of main.querySelectorAll("p")) {
    if (paragraph.closest("pre, table, details, figure, nav, aside")) continue;
    for (const node of paragraph.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE) continue;
      const match = /[^\s][^\n]{11,}/.exec(node.data);
      if (!match) continue;
      const text = match[0].slice(0, 20).trimEnd();
      if (text.length < 8 || whole.indexOf(text) !== whole.lastIndexOf(text))
        continue;
      paragraph.scrollIntoView({ block: "center", behavior: "instant" });
      const start = match.index;
      const end = start + text.length;
      const rect = (from, to) => {
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        return range.getBoundingClientRect();
      };
      const first = rect(start, start + 1);
      const last = rect(end - 1, end);
      if (Math.abs(first.top - last.top) > 2 || first.width === 0) continue;
      window.__verifyPhrase = { node, start, end };
      return {
        text,
        from: { x: first.left + 1, y: (first.top + first.bottom) / 2 },
        to: { x: last.right - 1, y: (last.top + last.bottom) / 2 },
      };
    }
  }
  return null;
}

/** Select the picked phrase without the mouse (when a drag did not land exactly on it). */
function selectPhrase() {
  const { node, start, end } = window.__verifyPhrase;
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  return selection.toString();
}

function sectionState({ tag, panel }) {
  const sections = Array.from(document.querySelectorAll(tag));
  return {
    sections: sections.length,
    hidden: sections.map(
      (section) => section.hidden || !section.checkVisibility(),
    ),
    panels: document.querySelectorAll(panel).length,
  };
}

// ── the browser ─────────────────────────────────────────────────────────────────────────────────

/**
 * A fresh context on `base`, the API origin routed by `api(route, request)`, everything else off-site aborted.
 * → { page, log, close } where log has every API request (method, path, status, headers, body), every off-site URL,
 * console errors and uncaught exceptions.
 */
async function openContext(browser, { base, apiOrigin, token, onApi }) {
  const origin = new URL(base).origin;
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    reducedMotion: "reduce",
    colorScheme: "light",
    serviceWorkers: "block",
  });
  const log = { api: [], offsite: [], console: [], errors: [] };
  await context.addInitScript(recordPage, { key: TOKEN_KEY, token });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin === apiOrigin) {
      const entry = {
        method: request.method(),
        path: url.pathname,
        headers: await request.allHeaders(),
        body: request.postData(),
        status: null,
      };
      log.api.push(entry);
      return onApi(route, request, entry);
    }
    log.offsite.push(url.href);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(WAIT_MS * 2);
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const where = message.location()?.url ?? "";
    // The browser's own line for an off-site request that failed: one this harness aborted (GA) or the API being
    // down, not something the page did wrong. A failed request to the site itself still counts.
    if (
      message.text().startsWith("Failed to load resource") &&
      where !== "" &&
      !where.startsWith(`${origin}/`)
    )
      return;
    log.console.push(message.text().slice(0, 160));
  });
  page.on("pageerror", (error) => log.errors.push(oneLine(error)));
  return { page, log, close: () => context.close().catch(() => {}) };
}

/** Forward an API request to the local worker, as the browser sent it. */
async function forward(worker, route, request, entry) {
  const url = new URL(request.url());
  const headers = { ...(await request.allHeaders()) };
  delete headers.host;
  delete headers["content-length"];
  const body = request.postDataBuffer();
  const response = await fetch(worker.url + url.pathname + url.search, {
    method: request.method(),
    headers,
    body: body && request.method() !== "GET" ? body : undefined,
  });
  entry.status = response.status;
  const answer = {};
  for (const [name, value] of response.headers)
    if (
      !["content-encoding", "content-length", "transfer-encoding"].includes(
        name,
      )
    )
      answer[name] = value;
  return route.fulfill({
    status: response.status,
    headers: answer,
    body: Buffer.from(await response.arrayBuffer()),
  });
}

async function until(page, predicate, timeout = WAIT_MS) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await page.waitForTimeout(50);
  }
}

const threadGets = (log, post) =>
  log.api.filter((e) => e.method === "GET" && e.path === threadsPath(post));
const threadPosts = (log, post) =>
  log.api.filter((e) => e.method === "POST" && e.path === threadsPath(post));

// ── the scenario ────────────────────────────────────────────────────────────────────────────────

const STEPS = [
  "load",
  "select",
  "write",
  "highlight",
  "contrast",
  "reload",
  "away",
  "back",
  "post-level",
  "orphan",
];

async function scenario(browser, { base, apiOrigin, worker, token, post }) {
  const route = `/posts/${post}`;
  const items = [];
  const { page, log, close } = await openContext(browser, {
    base,
    apiOrigin,
    token,
    onApi: (r, request, entry) => forward(worker, r, request, entry),
  });
  const { AxeBuilder } = await import("@axe-core/playwright");
  const stamp = crypto.randomBytes(4).toString("hex");
  const first = `verify 문장 댓글 ${stamp}`;
  const second = `verify 글 전체 댓글 ${stamp}`;
  let phrase = null;

  const highlight = () => page.evaluate(highlightTexts, HIGHLIGHT);
  /** Wait until the highlight holds exactly the phrase once. → problems */
  const expectOneRange = async (what) => {
    const ok = await until(page, async () => {
      const texts = await highlight();
      return texts && texts.length === 1 && texts[0] === phrase.text;
    });
    if (ok) return [];
    return [
      `${what}: CSS.highlights.get(${quote(HIGHLIGHT)}) holds ${JSON.stringify(await highlight())}, expected [${quote(phrase.text)}]`,
    ];
  };
  const loads = () => page.evaluate(() => window.__verifyComments?.loads ?? 0);
  /** A client-side navigation to `href` by clicking a link appended to <body>. → problems */
  const navigate = async (href) => {
    const before = await loads();
    await page.evaluate((target) => {
      const link = document.createElement("a");
      link.href = target;
      link.id = "verify-comments-link";
      link.textContent = "verify";
      document.body.append(link);
    }, href);
    await page.locator("#verify-comments-link").click();
    const ok = await until(
      page,
      async () => (await loads()) > before,
      WAIT_MS * 2,
    );
    return ok ? [] : [`navigation to ${href} did not fire astro:page-load`];
  };
  const step = async (name, fn) => {
    const problems = [];
    await fn(problems);
    items.push({ item: name, route, problems });
    // A step that could not do its part leaves nothing for the next ones to look at.
    if (problems.length) throw new Error(`stopped after ${name}`);
  };

  try {
    await step("load", async (problems) => {
      const response = await page.goto(base + route, { waitUntil: "load" });
      if (response?.status() !== 200)
        problems.push(`HTTP ${response?.status() ?? "?"}`);
      const got = await until(page, () => threadGets(log, post).length > 0);
      if (!got) problems.push(`no GET ${threadsPath(post)}`);
      const shown = await until(page, async () => {
        const state = await page.evaluate(sectionState, {
          tag: TAG,
          panel: PANEL,
        });
        return state.sections === 1 && !state.hidden[0];
      });
      if (!shown) problems.push(`<${TAG}> still hidden after the API answered`);
      if (threadGets(log, post).length > 1)
        problems.push(
          `${threadGets(log, post).length} GETs of the threads, expected 1`,
        );
    });

    await step("select", async (problems) => {
      phrase = await page.evaluate(pickPhrase);
      if (!phrase) {
        problems.push(
          "no body paragraph with a phrase that occurs once in <main>",
        );
        return;
      }
      await page.mouse.move(phrase.from.x, phrase.from.y);
      await page.mouse.down();
      await page.mouse.move(phrase.to.x, phrase.to.y, { steps: 8 });
      await page.mouse.up();
      const selected = await page.evaluate(() =>
        document.getSelection().toString(),
      );
      if (selected !== phrase.text) await page.evaluate(selectPhrase);
      const button = page.getByRole("button", {
        name: SELECT_BUTTON,
        exact: true,
      });
      const visible = await button
        .first()
        .waitFor({ state: "visible", timeout: WAIT_MS })
        .then(
          () => true,
          () => false,
        );
      if (!visible)
        problems.push(
          `no visible button named ${quote(SELECT_BUTTON)} after selecting ${quote(phrase.text)}`,
        );
      else if ((await button.count()) !== 1)
        problems.push(
          `${await button.count()} buttons named ${quote(SELECT_BUTTON)}`,
        );
    });

    await step("write", async (problems) => {
      const button = page.getByRole("button", {
        name: SELECT_BUTTON,
        exact: true,
      });
      await button.focus();
      await page.keyboard.press("Enter");
      const panel = page.locator(PANEL);
      const open = await panel
        .first()
        .waitFor({ state: "visible", timeout: WAIT_MS })
        .then(
          () => true,
          () => false,
        );
      if (!open) {
        problems.push(`no visible ${PANEL} after Enter on the button`);
        return;
      }
      const area = panel.first().locator("textarea").first();
      await area.fill(first);
      const before = threadPosts(log, post).length;
      const submitted = await area.evaluate((element) => {
        if (!element.form) return false;
        element.form.requestSubmit();
        return true;
      });
      if (!submitted) {
        problems.push(`the panel's <textarea> is not in a <form>`);
        return;
      }
      const sent = await until(page, () => {
        const posts = threadPosts(log, post);
        return posts.length > before && posts.at(-1).status !== null
          ? posts.at(-1)
          : null;
      });
      if (!sent) {
        problems.push(`no POST ${threadsPath(post)} after submitting`);
        return;
      }
      if (sent.status !== 201)
        problems.push(`POST answered ${sent.status}, expected 201`);
      if (sent.headers.authorization !== `Bearer ${token}`)
        problems.push(
          `POST sent Authorization ${quote(sent.headers.authorization ?? "(none)")}, expected the ${quote(TOKEN_KEY)} token`,
        );
      let anchor = null;
      try {
        anchor = JSON.parse(sent.body ?? "null")?.anchor ?? null;
      } catch {
        problems.push("POST body is not JSON");
      }
      if (anchor?.exact !== phrase.text)
        problems.push(
          `POST anchor.exact ${quote(anchor?.exact ?? "(none)")}, expected ${quote(phrase.text)}`,
        );
      const shown = await until(page, () =>
        panel
          .first()
          .evaluate(
            (element, text) => element.textContent.includes(text),
            first,
          ),
      );
      if (!shown) problems.push("the panel does not show the new comment");
    });

    await step("highlight", async (problems) => {
      problems.push(...(await expectOneRange("after commenting")));
    });

    await step("contrast", async (problems) => {
      // The theme is what data-theme says (the theme check proves the toggle sets it). Set here rather than
      // clicked: a click outside the panel may close it, and there would be nothing left to measure.
      for (const theme of ["light", "dark"]) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        if (!(await page.locator(PANEL).first().isVisible())) {
          problems.push(`${theme}: ${PANEL} is not visible to measure`);
          continue;
        }
        const { violations } = await new AxeBuilder({ page })
          .include(PANEL)
          .withRules(["color-contrast"])
          .analyze();
        for (const violation of violations)
          for (const node of violation.nodes)
            problems.push(
              `${theme}: color-contrast ${node.target.join(" >> ")}`,
            );
      }
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
      });
    });

    await step("reload", async (problems) => {
      const before = threadGets(log, post).length;
      await page.reload({ waitUntil: "load" });
      if (!(await until(page, () => threadGets(log, post).length > before)))
        problems.push(`no GET ${threadsPath(post)} after the reload`);
      problems.push(...(await expectOneRange("after a reload")));
    });

    await step("away", async (problems) => {
      problems.push(...(await navigate("/")));
      await page.waitForTimeout(300);
      const state = await page.evaluate(sectionState, {
        tag: TAG,
        panel: PANEL,
      });
      if (state.sections) problems.push(`${state.sections} <${TAG}> on /`);
      if (state.panels) problems.push(`${state.panels} ${PANEL} left on /`);
      const buttons = await page
        .getByRole("button", { name: SELECT_BUTTON })
        .count();
      if (buttons)
        problems.push(
          `${buttons} buttons named ${quote(SELECT_BUTTON)} left on /`,
        );
      const texts = await highlight();
      if (texts?.length)
        problems.push(
          `the ${quote(HIGHLIGHT)} highlight still holds ${JSON.stringify(texts)} on /`,
        );
    });

    await step("back", async (problems) => {
      const before = threadGets(log, post).length;
      problems.push(...(await navigate(route)));
      if (!(await until(page, () => threadGets(log, post).length > before)))
        problems.push(`no GET ${threadsPath(post)} after coming back`);
      const state = await page.evaluate(sectionState, {
        tag: TAG,
        panel: PANEL,
      });
      if (state.sections !== 1)
        problems.push(`${state.sections} <${TAG}>, expected 1`);
      problems.push(...(await expectOneRange("after coming back")));
    });

    await step("post-level", async (problems) => {
      await page.locator(TAG).first().scrollIntoViewIfNeeded();
      const found = await until(page, () =>
        page.evaluate(
          ({ tag, panel }) => {
            const area = Array.from(
              document.querySelectorAll(`${tag} textarea`),
            ).find((element) => !element.closest(panel));
            if (!area) return false;
            area.setAttribute("data-verify-comments", "post");
            return true;
          },
          { tag: TAG, panel: PANEL },
        ),
      );
      if (!found) {
        problems.push(`no <textarea> inside <${TAG}> outside the panel`);
        return;
      }
      const area = page.locator('textarea[data-verify-comments="post"]');
      await area.fill(second);
      const before = threadPosts(log, post).length;
      const submitted = await area.evaluate((element) => {
        if (!element.form) return false;
        element.form.requestSubmit();
        return true;
      });
      if (!submitted) {
        problems.push(`the post-level <textarea> is not in a <form>`);
        return;
      }
      const sent = await until(page, () => {
        const posts = threadPosts(log, post);
        return posts.length > before && posts.at(-1).status !== null
          ? posts.at(-1)
          : null;
      });
      if (!sent) {
        problems.push(`no POST ${threadsPath(post)} after submitting`);
        return;
      }
      if (sent.status !== 201)
        problems.push(`POST answered ${sent.status}, expected 201`);
      let anchor;
      try {
        anchor = JSON.parse(sent.body ?? "null")?.anchor;
      } catch {
        problems.push("POST body is not JSON");
      }
      if (anchor !== undefined && anchor !== null)
        problems.push(
          `a post-level comment was sent with anchor ${JSON.stringify(anchor).slice(0, 60)}`,
        );
      const shown = await until(page, () =>
        page.evaluate(
          ({ tag, panel, text }) =>
            Array.from(document.querySelectorAll(tag)).some((section) =>
              Array.from(section.querySelectorAll("*")).some(
                (element) =>
                  !element.closest(panel) &&
                  element.children.length === 0 &&
                  element.textContent.includes(text),
              ),
            ),
          { tag: TAG, panel: PANEL, text: second },
        ),
      );
      if (!shown)
        problems.push(`<${TAG}> does not show the post-level comment`);
      problems.push(...(await expectOneRange("after the post-level comment")));
    });

    await step("orphan", async (problems) => {
      worker.sql(
        `UPDATE threads SET quote_exact = 'verify: ${stamp} 본문에 없는 문장' WHERE quote_exact IS NOT NULL`,
      );
      const before = threadGets(log, post).length;
      await page.reload({ waitUntil: "load" });
      if (!(await until(page, () => threadGets(log, post).length > before)))
        problems.push(`no GET ${threadsPath(post)} after the reload`);
      await page
        .locator(TAG)
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      const listed = await until(page, () =>
        page.evaluate(
          ({ heading, text }) =>
            Array.from(
              document.querySelectorAll(
                "h1, h2, h3, h4, h5, h6, [role=heading]",
              ),
            ).some(
              (element) =>
                element.textContent.includes(heading) &&
                element.checkVisibility() &&
                (
                  element.closest("section") ?? element.parentElement
                ).textContent.includes(text),
            ),
          { heading: ORPHANS, text: first },
        ),
      );
      if (!listed)
        problems.push(
          `no visible heading ${quote(ORPHANS)} whose section holds the comment on the changed sentence`,
        );
      const texts = await highlight();
      if (texts?.length)
        problems.push(
          `the ${quote(HIGHLIGHT)} highlight holds ${JSON.stringify(texts)} for a sentence that is gone`,
        );
    });
  } catch (error) {
    if (!error.message.startsWith("stopped after "))
      items.push({
        item: STEPS[items.length] ?? "scenario",
        route,
        problems: [`crashed: ${oneLine(error)}`],
      });
    for (const name of STEPS.slice(items.length))
      items.push({
        item: name,
        route,
        problems: ["not reached: an earlier step failed"],
      });
  }

  const clean = [];
  const violations = await page
    .evaluate(() => window.__verifyComments?.violations ?? [])
    .catch(() => []);
  for (const violation of violations)
    clean.push(`blocked by CSP: ${violation}`);
  for (const url of log.offsite.filter((u) => u.includes(UTTERANCES)))
    clean.push(`requested ${url}`);
  for (const message of log.console) clean.push(`console error: ${message}`);
  for (const message of log.errors) clean.push(`uncaught: ${message}`);
  items.push({ item: "clean", route, problems: clean });
  await close();
  return items;
}

/** P with the API down in one of three ways. → one item */
async function apiDown(browser, { base, apiOrigin, post, mode }) {
  const route = `/posts/${post}`;
  const problems = [];
  const { page, log, close } = await openContext(browser, {
    base,
    apiOrigin,
    token: null,
    onApi: (r) => {
      if (mode === "abort") return r.abort("connectionrefused");
      if (mode === "503")
        return r.fulfill({
          status: 503,
          contentType: "application/json",
          headers: { "access-control-allow-origin": new URL(base).origin },
          body: JSON.stringify({
            error: { code: "internal", message: "down" },
          }),
        });
      return undefined; // never answered: the loader's own timeout decides
    },
  });
  try {
    await page.goto(base + route, { waitUntil: "load" });
    if (!(await until(page, () => threadGets(log, post).length > 0)))
      problems.push(`no GET ${threadsPath(post)}`);
    const hidden = () =>
      page
        .evaluate(sectionState, { tag: TAG, panel: PANEL })
        .then(
          (state) =>
            state.sections === 1 && state.hidden[0] && state.panels === 0,
        );
    if (!(await until(page, hidden, DOWN_WAIT_MS)))
      problems.push(
        `<${TAG}> not hidden ${DOWN_WAIT_MS / 1000}s after the request`,
      );
    else {
      await page.waitForTimeout(500);
      if (!(await hidden())) problems.push(`<${TAG}> shown again after hiding`);
    }
    const buttons = await page
      .getByRole("button", { name: SELECT_BUTTON })
      .count();
    if (buttons)
      problems.push(`${buttons} buttons named ${quote(SELECT_BUTTON)}`);
    const violations = await page.evaluate(
      () => window.__verifyComments?.violations ?? [],
    );
    for (const violation of violations)
      problems.push(`blocked by CSP: ${violation}`);
    for (const message of log.console)
      problems.push(`console error: ${message}`);
    for (const message of log.errors) problems.push(`uncaught: ${message}`);
  } catch (error) {
    problems.push(`crashed: ${oneLine(error)}`);
  } finally {
    await close();
  }
  return { item: `down:${mode}`, route, problems };
}

/** The first post linked from "/" that has <post-comments> (selected posts first). → { post } or { reason }. */
async function choosePost(ctx) {
  const all = candidateRoutes(
    Object.create(ctx, { args: { value: { ...ctx.args, route: [] } } }),
  );
  const home = await ctx.html("candidate", "/");
  if (home === null) return { reason: "no / in the candidate" };
  const listed = [
    ...new Set(
      load(home)("a[href]")
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
  for (const route of ordered) {
    const html = await ctx.html("candidate", route);
    if (html && load(html)(TAG).length === 1) return { post: postIdOf(route) };
  }
  return { reason: `no post linked from / has a <${TAG}>` };
}

// ── the check ───────────────────────────────────────────────────────────────────────────────────

async function run(ctx) {
  const routes = candidateRoutes(ctx);
  const outcomes = [];
  const apis = new Set();
  for (const route of routes) {
    const html = (await ctx.html("candidate", route)) ?? "";
    const { problems, api } = markupProblems(route, html);
    if (api !== null) apis.add(api);
    outcomes.push({ item: "markup", route, problems });
  }
  // Every page, not only the selected ones: the loader of any page may be the one that talks to another API.
  const origins = commentsApiOrigins(ctx.candidateDir);
  if (apis.size > 1 || origins.size > 1)
    outcomes.push({
      item: "markup",
      route: "-",
      problems: [
        `pages name different APIs: ${[...new Set([...apis, ...origins])].join(", ")}`,
      ],
    });

  const leftovers = listFiles(ctx.candidateDir).filter(
    (rel) =>
      TEXT_FILES.test(rel) &&
      fs
        .readFileSync(path.join(ctx.candidateDir, rel), "utf8")
        .includes(UTTERANCES),
  );
  outcomes.push({
    item: "assets",
    route: "-",
    problems: leftovers.length
      ? [
          `"${UTTERANCES}" in ${leftovers.slice(0, 5).join(", ")}${leftovers.length > 5 ? ` (+${leftovers.length - 5})` : ""}`,
        ]
      : [],
  });

  const { post, reason } = await choosePost(ctx);
  const apiOrigin = [...origins][0] ?? null;
  if (!post || apiOrigin === null)
    outcomes.push({
      item: "scenario",
      route: "-",
      problems: [reason ?? `no <${TAG} data-api> with an http(s) URL`],
    });
  else {
    const base = await ctx.serve("candidate");
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    let worker = null;
    try {
      worker = await startWorker(new URL(base).origin);
      const token = await testLogin(worker);
      outcomes.push(
        ...(await scenario(browser, { base, apiOrigin, worker, token, post })),
      );
      outcomes.push(
        ...(await mapLimit(["abort", "503", "timeout"], 3, (mode) =>
          apiDown(browser, { base, apiOrigin, post, mode }),
        )),
      );
    } catch (error) {
      outcomes.push({
        item: "scenario",
        route: `/posts/${post}`,
        problems: [`crashed: ${oneLine(error)}`],
      });
    } finally {
      await worker?.stop();
      await browser.close();
    }
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
    extra: { api: apiOrigin, post: post ?? null, outcomes },
  };
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────────

const cspHash = (text) =>
  `'sha256-${crypto.createHash("sha256").update(text).digest("base64")}'`;

/**
 * Put `<script>code</script>` right after the policy <meta> of every page and allow it by its hash, so it runs before
 * any script of the page. Throws when no page has a policy.
 */
function injectFirstScript(dir, code) {
  const element = `<script>${code}</script>`;
  editPages(dir, META, (meta) => {
    const withHash = meta.replace(
      /(script-src\b)([^;"]*)/,
      (_, name, rest) => `${name}${rest} ${cspHash(code)}`,
    );
    return `${withHash}${element}`;
  });
}

const commentedPost = (dir) => postRoutesWith(dir, /<post-comments\b/);

export default {
  name: NAME,
  kind: "browser",
  scope: "feature",
  run,

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        // Whatever the loader's file is called and wherever it is bundled: its element is never defined.
        name: "로더를 지움(post-comments 가 정의되지 않는다)",
        routes: commentedPost,
        apply(dir) {
          injectFirstScript(
            dir,
            'var d=customElements.define.bind(customElements);customElements.define=function(n,c,o){if(n!=="post-comments")d(n,c,o)};',
          );
        },
      },
      {
        name: "하이라이트 이름을 바꿈(comments → comments-renamed)",
        routes: commentedPost,
        apply(dir) {
          injectFirstScript(
            dir,
            'var r=CSS.highlights,s=r.set.bind(r),g=r.get.bind(r),x=r.delete.bind(r),m=function(n){return n==="comments"?"comments-renamed":n};r.set=function(n,h){return s(m(n),h)};r.delete=function(n){return x(m(n))};r.get=function(n){return n==="comments"?undefined:g(n)};',
          );
        },
      },
      {
        name: "CSP connect-src 에서 댓글 API 주소를 뺌",
        routes: commentedPost,
        apply(dir) {
          const origins = [...commentsApiOrigins(dir)];
          if (origins.length === 0)
            throw new Error("no <post-comments data-api> in the copy");
          editPages(dir, META, (meta) =>
            origins.reduce(
              (text, origin) => text.split(` ${origin}`).join(""),
              meta,
            ),
          );
        },
      },
      {
        name: "utterances 스크립트를 다시 넣음",
        routes: commentedPost,
        apply(dir) {
          editPages(
            dir,
            /<post-comments\b/,
            '<script src="https://utteranc.es/client.js" repo="bigsaigon333/bigsaigon333.github.io" issue-term="title" theme="boxy-light" crossorigin="anonymous" async></script><post-comments',
          );
        },
      },
      {
        name: "기준선에 없는 새 글에 post-comments 가 없음",
        routes: [NEW_PAGE.route],
        apply(dir) {
          const from = postFiles(dir).find((rel) =>
            /<post-comments\b/.test(
              fs.readFileSync(path.join(dir, rel), "utf8"),
            ),
          );
          if (!from)
            throw new Error("no post with <post-comments> in the copy");
          addPage(dir, from, (html) =>
            html.replace(/<post-comments\b[^>]*>[\s\S]*?<\/post-comments>/, ""),
          );
        },
      },
    ],
  },
};
