// Helpers shared by the static checks (routes, head, content, links, sitemap, budget) and live.mjs.
// Nothing here prints; checks return data and the runner prints one line per check.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { listRoutes, resolve } from "./resolve.mjs";

// ---------------------------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------------------------

/** Collapse runs of HTML whitespace to one space and trim. NBSP and other Unicode spaces are content and stay. */
export const collapse = (text) =>
  String(text ?? "")
    .replace(/[ \t\n\f\r]+/g, " ")
    .trim();

const BLOCK = new Set(
  (
    "address article aside blockquote br caption dd details dialog div dl dt fieldset figcaption figure footer form " +
    "h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section summary table tbody td tfoot th thead tr ul"
  ).split(" "),
);
const HIDDEN = new Set(["script", "style", "template"]);

/**
 * Text of a DOM node the way a reader sees it: block boundaries and <br> count as whitespace (so "</h2><p>" and
 * "</h2>\n<p>" read the same), script/style/template and comments are skipped. Not collapsed; wrap in collapse().
 */
export function textOf(node) {
  if (!node) return "";
  if (node.type === "text") return node.data;
  if (!node.children || HIDDEN.has(node.name)) return "";
  const inner = node.children.map(textOf).join("");
  return BLOCK.has(node.name) ? ` ${inner} ` : inner;
}

/** Exact concatenation of every text node below `node` (pre blocks, inline scripts and styles). */
export function rawText(node) {
  if (!node) return "";
  if (node.type === "text") return node.data;
  return (node.children ?? []).map(rawText).join("");
}

/**
 * Replace every rendered formula below `root` by a token built from its TeX source, so the markup of a particular
 * KaTeX version does not matter while the formula itself is still compared. Mutates the document.
 */
export function tokenizeMath($, root) {
  for (const annotation of root
    .find('annotation[encoding="application/x-tex"]')
    .toArray()) {
    if (!$.contains(root[0], annotation)) continue; // already replaced together with an enclosing formula
    const source = $(annotation);
    let formula = source.closest(".katex");
    if (!formula.length) formula = source.closest("math");
    if (!formula.length) continue;
    const display =
      formula.closest(".katex-display").length > 0 ||
      source.closest("math").attr("display") === "block";
    const token = `⟦${display ? "tex-display" : "tex"}:${rawText(annotation)}⟧`;
    formula.replaceWith($("<span></span>").text(token).contents());
  }
}

// ---------------------------------------------------------------------------------------------
// Differences, always written as "baseline → candidate" on one line
// ---------------------------------------------------------------------------------------------

// Characters a terminal shows as nothing or as a plain space: controls, NBSP, soft hyphen, zero-width and bidi marks,
// line and paragraph separators, narrow spaces, word joiner, BOM. Given as code point ranges to keep this file ASCII-safe.
const INVISIBLE = [
  [0x00, 0x1f],
  [0x7f, 0xa0],
  [0xad, 0xad],
  [0x200b, 0x200f],
  [0x2028, 0x202f],
  [0x2060, 0x2060],
  [0xfeff, 0xfeff],
];
const isInvisible = (code) =>
  INVISIBLE.some(([from, to]) => code >= from && code <= to);
const spellOut = (text) =>
  text.replace(/[^ -~]/g, (c) =>
    isInvisible(c.charCodeAt(0))
      ? "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
      : c,
  );

/** Quoted, single-line form of a value; invisible characters are spelled out. `null`/`undefined` → "(none)". */
export function quote(value, max = 80) {
  if (value === null || value === undefined) return "(none)";
  const text = String(value);
  const clipped = text.length > max ? `${text.slice(0, max)}…` : text;
  return spellOut(JSON.stringify(clipped));
}

/** Index of the first differing UTF-16 unit, or -1 when the strings are equal. */
export function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

/** About 2×radius characters of `text` around position `at`. */
export function contextAt(text, at, radius = 20) {
  const from = Math.max(0, at - radius);
  const to = Math.min(text.length, at + radius);
  return quote(
    `${from > 0 ? "…" : ""}${text.slice(from, to)}${to < text.length ? "…" : ""}`,
    4 * radius,
  );
}

/** "differs at 123: "…baseline…" → "…candidate…"", or null when the strings are equal. */
export function diffText(baseline, candidate) {
  const at = firstDiff(baseline, candidate);
  if (at === -1) return null;
  return `differs at ${at}: ${contextAt(baseline, at)} → ${contextAt(candidate, at)}`;
}

/** First difference between two ordered lists of strings on one line, or null when the lists are equal. */
export function diffList(name, baseline, candidate) {
  const n = Math.min(baseline.length, candidate.length);
  let i = 0;
  while (i < n && baseline[i] === candidate[i]) i++;
  if (i === baseline.length && i === candidate.length) return null;

  const count =
    baseline.length === candidate.length
      ? ""
      : ` (${baseline.length} → ${candidate.length} items)`;
  if (i < n)
    return `${name}[${i}]${count} ${diffText(baseline[i], candidate[i])}`;
  return `${name}[${i}]${count}: ${quote(baseline[i], 60)} → ${quote(candidate[i], 60)}`;
}

/** Keep a failure detail on one line. */
export const oneLine = (text) => String(text).replace(/\s*[\r\n]+\s*/g, " ⏎ ");

// ---------------------------------------------------------------------------------------------
// Files and references
// ---------------------------------------------------------------------------------------------

export const sha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

/** Every file below `root` as a sorted list of "/"-separated relative paths (dotfiles included). */
export function listFiles(root) {
  root = path.resolve(root);
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile())
        files.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  };
  if (fs.existsSync(root)) walk(root);
  return files.sort();
}

/** Relative paths of the baseline files that are not HTML pages: public assets, sitemap.xml, robots.txt, _next/. */
export const listAssets = (root) =>
  listFiles(root).filter((rel) => !rel.endsWith(".html"));

/** URL path of a relative file path ("a b/c.png" → "/a%20b/c.png"). */
export const urlPathOf = (rel) =>
  `/${rel.split("/").map(encodeURIComponent).join("/")}`;

/**
 * Site-relative pathname a reference points to, without query and fragment. Returns null for references that leave
 * the site or stay on the page: other origins ("https:", "//host", "mailto:"), fragment-only links and empty values.
 * Root-relative ("/x") and document-relative ("x", "../x") references are both internal.
 */
export function internalPath(reference, route = "/") {
  const value = String(reference ?? "").trim();
  if (value === "" || value.startsWith("#")) return null;
  if (value.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(value)) return null;
  try {
    const url = new URL(value, `http://site.invalid${route}`);
    return url.host === "site.invalid" ? url.pathname : null;
  } catch {
    return null;
  }
}

/** URLs of a srcset attribute ("a.webp 1x, b.webp 2x" → ["a.webp", "b.webp"]). */
export const srcsetUrls = (srcset) =>
  String(srcset ?? "")
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter(Boolean);

const dirOf = (ctx, side) => {
  const dir = side === "baseline" ? ctx.baselineDir : ctx.candidateDir;
  // createContext({ baseline: null }): a run with --feature, which only runs checks that never read the baseline.
  if (dir === null)
    throw new Error(
      `this run has no baseline (--feature), but the check reads the ${side}`,
    );
  return dir;
};
const isRemote = (ctx, side) =>
  side === "candidate" && Boolean(ctx.candidateUrl);

const remoteCache = new WeakMap();

/** GET `pathname` from ctx.candidateUrl without following redirects; cached per context. */
async function fetchRemote(ctx, pathname) {
  if (!remoteCache.has(ctx)) remoteCache.set(ctx, new Map());
  const cache = remoteCache.get(ctx);
  if (!cache.has(pathname)) {
    cache.set(
      pathname,
      (async () => {
        try {
          const response = await fetch(ctx.candidateUrl + pathname, {
            redirect: "manual",
          });
          const body = Buffer.from(await response.arrayBuffer());
          return {
            status: response.status,
            body: response.status === 200 ? body : null,
            location: response.headers.get("location"),
          };
        } catch (error) {
          return {
            status: 0,
            body: null,
            location: null,
            error: String(error.cause?.message ?? error.message ?? error),
          };
        }
      })(),
    );
  }
  return cache.get(pathname);
}

/**
 * What a browser gets for a site-relative URL path on `side`: { status, body, location } with body a Buffer when
 * status is 200 and location set on a redirect (never followed). A directory is resolved like GitHub Pages does
 * (lib/resolve.mjs); with ctx.candidateUrl the candidate is fetched, and status 0 + error means the request failed.
 */
export async function probe(ctx, side, pathname) {
  if (isRemote(ctx, side)) return fetchRemote(ctx, pathname);
  const hit = resolve(dirOf(ctx, side), pathname);
  return {
    status: hit.status,
    body: hit.status === 200 ? fs.readFileSync(hit.file) : null,
    location: hit.location ?? null,
  };
}

/** HTTP status a browser gets for a site-relative URL path on `side` (0 when the request itself failed). */
export async function statusOf(ctx, side, pathname) {
  if (isRemote(ctx, side)) return (await fetchRemote(ctx, pathname)).status;
  return resolve(dirOf(ctx, side), pathname).status;
}

/** Bytes of the file stored at relative path `rel` on `side`, or null when there is no such file. */
export async function readSiteFile(ctx, side, rel) {
  if (isRemote(ctx, side)) return (await fetchRemote(ctx, urlPathOf(rel))).body;
  const file = path.join(dirOf(ctx, side), rel);
  try {
    return fs.statSync(file).isFile() ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

/**
 * HTML routes of the candidate. A directory is listed; a deployed site cannot be listed, so there the baseline
 * routes are used. Narrowed by --route like ctx.routes. Checks that never read the baseline (scope "feature",
 * links) walk these, not ctx.routes: a page a new post adds is not among the baseline's routes.
 */
export function candidateRoutes(ctx) {
  if (ctx.candidateUrl) return ctx.routes;
  const wanted = ctx.args?.route ?? [];
  const routes = fs.existsSync(ctx.candidateDir)
    ? listRoutes(ctx.candidateDir)
    : [];
  return wanted.length
    ? routes.filter((route) => wanted.includes(route))
    : routes;
}

// ---------------------------------------------------------------------------------------------
// Allowlist and self-test
// ---------------------------------------------------------------------------------------------

/**
 * Collects accepted differences of one check. `skip(item, detail)` returns true when `item` is in allowlist.json;
 * the item then lands in extra.allowed instead of failed.
 */
export function allowances(ctx, check) {
  const allowed = [];
  return {
    allowed,
    skip(item, detail) {
      const reason = ctx.allowed(check, item);
      if (reason === null) return false;
      allowed.push(
        detail === undefined ? { item, reason } : { item, reason, detail },
      );
      return true;
    },
  };
}

/**
 * Self-test: apply `edit` (text → text) to the first of `rels`, in order, that it changes.
 * Throws when it changes none of them, so a mutation can never be a silent no-op.
 */
export function mutateFirst(dir, rels, edit) {
  for (const rel of rels) {
    const file = path.join(dir, rel);
    const before = fs.readFileSync(file, "utf8");
    const after = edit(before);
    if (typeof after === "string" && after !== before) {
      fs.writeFileSync(file, after);
      return rel;
    }
  }
  throw new Error(
    `mutation changed nothing in: ${rels.slice(0, 3).join(", ") || "(no files)"}`,
  );
}

/** Self-test: apply `edit` to one file of a mutant copy; throws when the edit changes nothing. */
export const mutateFile = (dir, rel, edit) => mutateFirst(dir, [rel], edit);

/** Self-test: relative paths of the post pages of a site copy, sorted. */
export const postFiles = (dir) =>
  listFiles(dir).filter((rel) => /^posts\/[^/]+\.html$/.test(rel));

/** Self-test: route of a page file of a site copy ("index.html" → "/", "posts/a.html" → "/posts/a"). */
export const routeOfPage = (rel) =>
  rel === "index.html" ? "/" : `/${rel.replace(/\.html$/, "")}`;

/** Self-test: the page addPage() adds. Neither the baseline nor the build has it. */
export const NEW_PAGE = {
  file: "posts/only-in-candidate.html",
  route: "/posts/only-in-candidate",
};

/**
 * Self-test: add NEW_PAGE to a site copy, made of its page `from` changed by `edit` (text → text; without one, the
 * page is copied as it is). A check that walks the routes of the baseline instead of the candidate's never sees
 * it, so a mutation made with this proves the check looks at what a new post would add. Throws when the page
 * exists already or `edit` changes nothing. A mutation declares `routes: [NEW_PAGE.route]`.
 */
export function addPage(dir, from, edit) {
  const target = path.join(dir, NEW_PAGE.file);
  if (fs.existsSync(target))
    throw new Error(`${NEW_PAGE.file} exists already in ${dir}`);
  const before = fs.readFileSync(path.join(dir, from), "utf8");
  const after = edit ? edit(before) : before;
  if (typeof after !== "string" || (edit && after === before))
    throw new Error(`mutation changed nothing in: ${from}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, after);
}

/**
 * Self-test: the routes of the first post pages of a site copy whose HTML matches `pattern`, for a mutation
 * that only shows on such a page (`routes` of a mutation). Throws when no post matches.
 */
export function postRoutesWith(dir, pattern, limit = 1) {
  const routes = postFiles(dir)
    .filter((rel) => pattern.test(fs.readFileSync(path.join(dir, rel), "utf8")))
    .slice(0, limit)
    .map(routeOfPage);
  if (routes.length === 0) throw new Error(`no post page matches ${pattern}`);
  return routes;
}

/**
 * Self-test: apply `pattern → replacement` to every page of a site copy. Throws when nothing matched.
 *
 * In a Next.js build the styled-components rules are inlined in the HTML. Hydration takes the rules of a
 * component over from there as they are, so an edit to one of those is what the browser ends up with. It writes
 * the global rules (a, h1, …) anew from JavaScript: an edit to one of those is undone and proves nothing.
 */
export function editPages(dir, pattern, replacement) {
  let edited = 0;
  for (const rel of listFiles(dir)) {
    if (!rel.endsWith(".html")) continue;
    const file = path.join(dir, rel);
    const before = fs.readFileSync(file, "utf8");
    const after = before.replace(pattern, replacement);
    if (after === before) continue;
    fs.writeFileSync(file, after);
    edited += 1;
  }
  if (edited === 0)
    throw new Error(
      `mutation did not apply: ${pattern} not found in any page under ${dir}`,
    );
}

/** Self-test: replace the first match of `pattern` inside <main>…</main> only. Returns the input when nothing matches. */
export function replaceInMain(html, pattern, replacement) {
  const start = html.indexOf("<main");
  const end = html.indexOf("</main>", start);
  if (start === -1 || end === -1) return html;
  return (
    html.slice(0, start) +
    html.slice(start, end).replace(pattern, replacement) +
    html.slice(end)
  );
}
