// npm run verify:live -- --base-url=<url> [--only=status,head,content,sitemap] [--route=/posts/x]
// npm run verify:live -- --serve=<dir>      rehearsal: serve <dir> locally (GitHub Pages resolution) and verify that
//
// After a deploy: the real URLs answer like the baseline (.verify/baseline). In the deploy workflow the baseline is
// the build of the commit just deployed (`npm run verify:setup -- --baseline-ref=<that sha>`).
//   status                   every route, /sitemap.xml, /robots.txt and every public asset of the baseline answers
//                            200 to a GET that does not follow redirects
//   head, content, sitemap   the same checks as `npm run verify`, reading the candidate over HTTP
// Prints one line per check; details go to .verify/report/. Exit code 0 only if everything passed,
// 1 when a check failed, 2 when the command line asks for something that does not exist.
// A summary of the run goes to the reporter module, if there is one (VERIFY_REPORTER, see lib/runner.mjs report()).
import fs from "node:fs";
import path from "node:path";

import { listAssets, probe, urlPathOf } from "./lib/html.mjs";
import { baselineDir } from "./lib/paths.mjs";
import { listRoutes } from "./lib/resolve.mjs";
import {
  acceptNotices,
  createContext,
  exitWithUsage,
  formatResults,
  loadChecks,
  parseArgsOrExit,
  report,
  runChecks,
  summaryLine,
  toMatrix,
  UsageError,
  validateSelection,
} from "./lib/runner.mjs";
import { startServer } from "./serve.mjs";

/** Checks of `npm run verify` that also run here, all of them unless --only says otherwise. */
const REUSED = ["head", "content", "sitemap"];
const USAGE =
  "usage: npm run verify:live -- --base-url=<url> | --serve=<dir>\n" +
  `                              [--only=status,${REUSED.join(",")}] [--route=<route,…>]`;

const args = parseArgsOrExit("live", USAGE);
const started = performance.now();

const usage = (message) => exitWithUsage(new UsageError(message), USAGE);

if (!fs.existsSync(path.join(baselineDir, "index.html"))) {
  console.error("baseline missing — run `npm run verify:setup` first");
  process.exit(2);
}

const hasValue = (value) => typeof value === "string" && value !== "";
if (hasValue(args.baseUrl) === hasValue(args.serve))
  usage("give exactly one of --base-url=<url> and --serve=<dir>");
try {
  validateSelection(args, {
    checkNames: ["status", ...REUSED],
    routes: listRoutes(baselineDir),
  });
} catch (error) {
  exitWithUsage(error, USAGE);
}

let server = null;
let baseUrl;
if (hasValue(args.serve)) {
  const dir = path.resolve(args.serve);
  if (!fs.existsSync(dir)) usage(`no such directory: ${args.serve}`);
  server = await startServer(dir);
  baseUrl = server.url;
} else {
  let url;
  try {
    url = new URL(args.baseUrl);
  } catch {
    usage(`not a URL: ${args.baseUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    usage(`not an http(s) URL: ${args.baseUrl}`);
  baseUrl = (url.origin + url.pathname).replace(/\/+$/, "");
}

/** Status of everything the baseline serves, without following redirects. Not in checks/: it only makes sense live. */
const status = {
  name: "status",
  kind: "static",

  async run(ctx) {
    // Public assets = non-HTML baseline files the Astro site is expected to keep (not allowlisted in the routes check).
    const assets = listAssets(ctx.baselineDir).filter(
      (rel) => ctx.allowed("routes", `asset:${rel}`) === null,
    );
    const targets = [
      ...new Set([
        ...ctx.routes,
        "/sitemap.xml",
        "/robots.txt",
        ...assets.map(urlPathOf),
      ]),
    ];

    const failed = [];
    const cells = {};
    let pass = 0;
    for (const target of targets) {
      const answer = await probe(ctx, "candidate", target);
      const ok = answer.status === 200;
      if (ok) pass++;
      else {
        const detail =
          answer.status === 0
            ? `request failed: ${answer.error}`
            : `HTTP ${answer.status}${answer.location ? ` → ${answer.location}` : ""}, expected 200`;
        failed.push({ route: target, detail });
      }
      if (ctx.routes.includes(target)) cells[target] = ok ? "pass" : "fail";
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { baseUrl: ctx.candidateUrl, targets },
    };
  },
};

const ctx = createContext({ candidateUrl: baseUrl, args });

// A request that fails outright (DNS, refused connection) makes ctx.html() throw, which would crash each reused check.
// Live, an unreachable page is simply a page the candidate does not serve; the status check reports the cause.
const html = ctx.html;
ctx.html = async (side, route) => {
  try {
    return await html(side, route);
  } catch {
    return null;
  }
};

const wanted = args.only;
const reused = wanted.length
  ? REUSED.filter((name) => wanted.includes(name))
  : REUSED;
const loaded = reused.length ? await loadChecks({ only: reused }) : []; // an empty `only` would mean "every check"
const missing = reused.filter(
  (name) => !loaded.some((check) => check.name === name),
);
if (missing.length) {
  // A check that has gone missing must not turn into a shorter list of passes.
  console.error(
    `no such check module: ${missing.join(", ")} (scripts/verify/checks)`,
  );
  process.exit(2);
}
const checks = [
  ...(wanted.length === 0 || wanted.includes("status") ? [status] : []),
  // In the order of REUSED, not of the file names.
  ...reused.map((name) => loaded.find((check) => check.name === name)),
];

let results = [];
try {
  results = await runChecks(ctx, checks);
} finally {
  await ctx.close();
  await server?.close();
}

for (const line of formatResults(results)) console.log(line);
for (const line of acceptNotices(ctx)) console.log(`WARN  ${line}`);

const ok = results.length > 0 && results.every((result) => result.ok);
const durationMs = Math.round(performance.now() - started);
console.log(summaryLine(results, durationMs));

await report({
  command: "live",
  results,
  matrix: toMatrix(ctx, results),
  durationMs,
});

process.exit(ok ? 0 : 1);
