// embeds — Google Analytics and utterances must be wired exactly as on the baseline.
//
// Read from the live DOM after scripts have run, with the embeds themselves blocked (lib/browser.mjs):
//   ga.loader    ids of <script src="https://www.googletagmanager.com/gtag/js?id=…">
//   ga.config    ids passed to gtag("config", …), as recorded in window.dataLayer
//   utterances   repo, issue-term, theme, crossorigin and async of the utteranc.es client script, or null
import fs from "node:fs";
import path from "node:path";

import { mapLimit, MAX_PAGES, openBrowser } from "../lib/browser.mjs";

const NAME = "embeds";
const VIEWPORT = { width: 1280, height: 900 };

// A settled page has normally run its scripts already. These bound the wait for one that has not.
// The baseline adds its embeds from JavaScript after hydration: how long to wait for analytics to show up.
const BASELINE_WAIT_MS = 10_000;
// How long the candidate gets to end up with the same embeds as the baseline. Only spent when it differs.
const CANDIDATE_WAIT_MS = 2_000;

const oneLine = (error) => String(error?.message ?? error).split("\n")[0];

// ── in the page ─────────────────────────────────────────────────────────────────────────────────

function readEmbeds() {
  const loader = [];
  for (const script of document.querySelectorAll("script[src]")) {
    let url;
    try {
      url = new URL(script.src);
    } catch {
      continue;
    }
    const google =
      url.hostname === "googletagmanager.com" ||
      url.hostname.endsWith(".googletagmanager.com");
    if (google && url.pathname === "/gtag/js")
      loader.push(url.searchParams.get("id"));
  }

  const config = [];
  for (const entry of Array.from(window.dataLayer ?? [])) {
    if (entry && entry[0] === "config") config.push(String(entry[1]));
  }

  const utterances = Array.from(
    document.querySelectorAll('script[src="https://utteranc.es/client.js"]'),
    (script) => ({
      repo: script.getAttribute("repo"),
      "issue-term": script.getAttribute("issue-term"),
      theme: script.getAttribute("theme"),
      crossorigin: script.crossOrigin,
      async: script.async,
    }),
  );

  return {
    ga: { loader: loader.sort(), config: config.sort() },
    // One script is the normal case; more than one is a difference worth seeing.
    utterances:
      utterances.length === 0
        ? null
        : utterances.length === 1
          ? utterances[0]
          : utterances,
  };
}

// Expressions evaluated in the page until they hold: has it finished adding its embeds?
const hasAnalytics = `((embeds) => embeds.ga.loader.length > 0 && embeds.ga.config.length > 0)((${readEmbeds})())`;
const sameAs = (expected) =>
  `JSON.stringify((${readEmbeds})()) === ${JSON.stringify(JSON.stringify(expected))}`;

// ── the check ───────────────────────────────────────────────────────────────────────────────────

/** Embeds of one page, read once `ready` (an expression evaluated in the page) holds or `timeout` has passed. */
function collect(browser, url, route, ready, timeout) {
  return browser.withPage(VIEWPORT, async (tab) => {
    const status = await tab.open(url);
    if (status >= 400 && route !== "/404") throw new Error(`HTTP ${status}`);
    if (tab.failures.length)
      throw new Error(`third-party request failed: ${tab.failures[0]}`);

    await tab.page.waitForFunction(ready, null, { timeout }).catch(() => {});
    await tab.settle(); // whatever added one embed may still be adding the next
    return tab.page.evaluate(readEmbeds);
  });
}

const FIELDS = [
  ["ga.loader", (embeds) => embeds.ga.loader],
  ["ga.config", (embeds) => embeds.ga.config],
  ["utterances", (embeds) => embeds.utterances],
];

function differences(baseline, candidate) {
  const found = [];
  for (const [name, pick] of FIELDS) {
    const expected = JSON.stringify(pick(baseline));
    const actual = JSON.stringify(pick(candidate));
    if (expected !== actual)
      found.push(`${name}: baseline ${expected} ≠ candidate ${actual}`);
  }
  return found;
}

async function run(ctx) {
  const cells = {};
  const allowed = [];
  const routes = [];
  for (const route of ctx.routes) {
    const reason = ctx.allowed(NAME, `route:${route}`);
    if (reason) {
      cells[route] = "skip";
      allowed.push({ item: `route:${route}`, reason });
    } else {
      routes.push(route);
    }
  }

  const browser = await openBrowser(ctx);
  let outcomes;
  try {
    const urls = {
      baseline: await ctx.serve("baseline"),
      candidate: await ctx.serve("candidate"),
    };

    // One page at a time per route, so MAX_PAGES routes in flight are MAX_PAGES pages.
    outcomes = await mapLimit(routes, MAX_PAGES, async (route) => {
      let baseline;
      let candidate;
      try {
        baseline = await collect(
          browser,
          urls.baseline + route,
          route,
          hasAnalytics,
          BASELINE_WAIT_MS,
        );
      } catch (error) {
        return { route, ok: false, problems: [`baseline: ${oneLine(error)}`] };
      }
      try {
        candidate = await collect(
          browser,
          urls.candidate + route,
          route,
          sameAs(baseline),
          CANDIDATE_WAIT_MS,
        );
      } catch (error) {
        return {
          route,
          ok: false,
          baseline,
          problems: [`candidate: ${oneLine(error)}`],
        };
      }
      const problems = differences(baseline, candidate);
      return {
        route,
        ok: problems.length === 0,
        baseline,
        candidate,
        problems,
      };
    });
  } finally {
    await browser.close();
  }

  const failed = [];
  for (const outcome of outcomes) {
    cells[outcome.route] = outcome.ok ? "pass" : "fail";
    if (!outcome.ok)
      failed.push({
        route: outcome.route,
        detail: outcome.problems.join("; "),
      });
  }

  return {
    ok: failed.length === 0,
    pass: outcomes.length - failed.length,
    fail: failed.length,
    failed,
    cells,
    extra: { routes: outcomes, allowed },
  };
}

// ── selftest ────────────────────────────────────────────────────────────────────────────────────

/** Apply `pattern → replacement` to every JavaScript chunk of a Next.js build. Throws when nothing matched. */
function editChunks(dir, pattern, replacement) {
  const chunks = path.join(dir, "_next", "static", "chunks");
  let edited = 0;
  for (const name of fs.readdirSync(chunks, { recursive: true })) {
    const file = path.join(chunks, name);
    if (!file.endsWith(".js")) continue;
    const before = fs.readFileSync(file, "utf8");
    const after = before.replace(pattern, replacement);
    if (after === before) continue;
    fs.writeFileSync(file, after);
    edited += 1;
  }
  if (edited === 0)
    throw new Error(
      `mutation did not apply: ${pattern} not found under ${chunks}`,
    );
}

export default {
  name: NAME,
  kind: "browser",
  run,

  selftest: {
    mutations: [
      {
        name: "GA 측정 ID 변경",
        apply(dir) {
          editChunks(dir, /\bG-[A-Z0-9]{6,}\b/g, "G-MUTANT0000");
        },
      },
      {
        name: "utterances 테마 변경",
        apply(dir) {
          editChunks(dir, /\("theme","[^"]+"\)/, '("theme","github-dark")');
        },
      },
    ],
  },
};
