// external — every page asks other origins only for what the site has to get from elsewhere. Candidate-only
// (scope "feature"): it lists the origins of the new build and never reads the baseline.
//
// What a page requests or references, per page:
//   attributes   src, srcset, poster, data (object) of any element, and href of every element but <a> and <area>
//                (links are navigations, not requests). <link rel="canonical|alternate|author|me|license"> are
//                links too and are skipped.
//   inline CSS   url(…) and @import in <style> and in style="…"
//   linked CSS   the same in every same-origin stylesheet a page links, followed through same-origin @import
//   inline JS    every absolute http(s) URL written in an inline JavaScript <script> (the GA loader builds its URL
//                there); data blocks such as JSON-LD are not run and are skipped
// Protocol-relative ("//host/…") counts as https. The site's own origin (from <link rel="canonical">) is local.
//
// One failed item per page and origin outside ALLOWED, naming where it was found. Fails as well when there are no
// pages, or when no page references any allowed origin (GA is on every page, so finding nothing means this does
// not see what it should).
import { load } from "cheerio";

import {
  candidateRoutes,
  editPages,
  internalPath,
  listFiles,
  mutateFile,
  readSiteFile,
  srcsetUrls,
} from "../lib/html.mjs";

/** host suffix → why it may be requested. A host matches itself and its subdomains. */
const ALLOWED = {
  "googletagmanager.com": "Google Analytics loader",
  "google-analytics.com": "Google Analytics collector",
  "utteranc.es": "utterances comments",
  "user-images.githubusercontent.com": "images inside posts",
};

const NOT_REQUESTS = new Set([
  "canonical",
  "alternate",
  "author",
  "me",
  "license",
]);

const matches = (hostname, domain) =>
  hostname === domain || hostname.endsWith(`.${domain}`);
const allowedBy = (origin) =>
  Object.keys(ALLOWED).find((domain) =>
    matches(new URL(origin).hostname, domain),
  );

/** Origin of an absolute or protocol-relative reference, or null for a reference that stays on the site. */
function originOf(reference) {
  const value = String(reference ?? "").trim();
  const absolute = value.startsWith("//") ? `https:${value}` : value;
  if (!/^https?:\/\//i.test(absolute)) return null;
  try {
    return new URL(absolute).origin;
  } catch {
    return null;
  }
}

const CSS_URL = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
const CSS_IMPORT = /@import\s+(['"])([^'"]+)\1/g;
const JS_URL = /(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}(?=[/"'`?:]|$)/gi;

const JS_TYPES = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
]);

const cssRefs = (css) => [
  ...[...css.matchAll(CSS_URL)].map((m) => m[2]),
  ...[...css.matchAll(CSS_IMPORT)].map((m) => m[2]),
];

const pageFile = (route) =>
  route === "/" ? "index.html" : `${route.slice(1)}.html`;

export default {
  name: "external",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const routes = candidateRoutes(ctx);
    const cssCache = new Map(); // site path → Promise<string[]> (references of that stylesheet and its imports)
    const seenAllowed = new Set();
    let pass = 0;

    const readCss = (pathname, trail = new Set()) => {
      if (!cssCache.has(pathname))
        cssCache.set(
          pathname,
          (async () => {
            const body = await readSiteFile(
              ctx,
              "candidate",
              decodeURIComponent(pathname.slice(1)),
            );
            if (body === null) return [];
            const refs = cssRefs(body.toString("utf8"));
            const out = [];
            for (const ref of refs) {
              out.push(ref);
              const local = internalPath(ref, pathname);
              if (local && local.endsWith(".css") && !trail.has(local))
                out.push(...(await readCss(local, new Set([...trail, local]))));
            }
            return out;
          })(),
        );
      return cssCache.get(pathname);
    };

    for (const route of routes) {
      const body = await readSiteFile(ctx, "candidate", pageFile(route));
      if (body === null) {
        failed.push({ route, detail: "page missing in candidate" });
        continue;
      }
      const $ = load(body.toString("utf8"));
      const own = originOf($('link[rel="canonical"]').attr("href"));
      const found = new Map(); // origin → Set of places
      const note = (reference, where) => {
        const origin = originOf(reference);
        if (origin === null || origin === own) return;
        if (!found.has(origin)) found.set(origin, new Set());
        found.get(origin).add(where);
      };

      for (const element of $("*").toArray()) {
        const tag = element.tagName;
        const attr = (name) => $(element).attr(name);
        for (const name of ["src", "poster", "data"])
          if (attr(name)) note(attr(name), `<${tag} ${name}>`);
        for (const name of ["srcset", "imagesrcset"])
          for (const url of srcsetUrls(attr(name)))
            note(url, `<${tag} ${name}>`);
        if (attr("href") && tag !== "a" && tag !== "area") {
          const rels = (attr("rel") ?? "").toLowerCase().split(/\s+/);
          if (!(tag === "link" && rels.some((rel) => NOT_REQUESTS.has(rel))))
            note(attr("href"), `<${tag} rel=${rels.join(" ") || "-"} href>`);
          if (tag === "link" && rels.includes("stylesheet")) {
            const local = internalPath(attr("href"), route);
            if (local)
              for (const ref of await readCss(local))
                note(ref, `stylesheet ${local}`);
          }
        }
        if (attr("style"))
          for (const ref of cssRefs(attr("style"))) note(ref, `<${tag} style>`);
      }
      for (const style of $("style").toArray())
        for (const ref of cssRefs($(style).text())) note(ref, "<style>");
      for (const script of $("script:not([src])").toArray()) {
        const type = ($(script).attr("type") ?? "").trim().toLowerCase();
        if (!JS_TYPES.has(type)) continue; // JSON-LD and other data blocks are never fetched
        for (const ref of $(script).text().match(JS_URL) ?? [])
          note(ref, "inline <script>");
      }

      const bad = [];
      for (const [origin, places] of found) {
        if (allowedBy(origin)) seenAllowed.add(origin);
        else bad.push(`${origin} (${[...places].join(", ")})`);
      }
      if (bad.length === 0) pass++;
      else
        failed.push({
          route,
          detail: `requests an origin outside the allowlist: ${bad.join("; ")}`,
        });
    }

    if (routes.length === 0)
      failed.push({ route: "-", detail: "no pages in candidate" });
    else if (seenAllowed.size === 0)
      failed.push({
        route: "-",
        detail:
          "no page references any allowed origin (GA is on every page): the extraction sees nothing",
      });

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      extra: { allowed: ALLOWED, seen: [...seenAllowed].sort() },
    };
  },

  selftest: {
    mutations: [
      {
        name: "CDN 스타일시트 link 추가",
        apply(dir) {
          editPages(
            dir,
            "</head>",
            '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.0/dist/katex.min.css"></head>',
          );
        },
      },
      {
        name: "인라인 style 에 원격 글꼴 url()",
        apply(dir) {
          editPages(
            dir,
            "</head>",
            "<style>@font-face{font-family:x;src:url(https://fonts.gstatic.com/s/x.woff)}</style></head>",
          );
        },
      },
      {
        name: "연결된 CSS 파일에 원격 @import",
        apply(dir) {
          const css = listFiles(dir).filter((rel) => rel.endsWith(".css"));
          if (css.length === 0) throw new Error("no stylesheet file in copy");
          for (const rel of css)
            mutateFile(
              dir,
              rel,
              (text) =>
                `@import "https://fonts.googleapis.com/css2?family=X";\n${text}`,
            );
        },
      },
      {
        name: "preconnect 추가",
        apply(dir) {
          editPages(
            dir,
            "</head>",
            '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin></head>',
          );
        },
      },
    ],
  },
};
