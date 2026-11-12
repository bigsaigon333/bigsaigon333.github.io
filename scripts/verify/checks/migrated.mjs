// migrated — the candidate is the new build, not the Next.js export it replaces. Candidate-only.
//
// Every parity check compares the candidate with the deployed site, so the deployed site itself passes all of
// them: `npm run verify:live` pointed at the old deployment would report success. This is the one assertion
// that deployment cannot satisfy. On every HTML page of the candidate:
//
//   - no element with id "__next" (the root every Next.js page renders into) or "__NEXT_DATA__" (its data)
//   - no reference into /_next/: href, src and every srcset entry of any element
//
// Scope "feature": the baseline fails it by design, so the self-test runs it against dist/.
// There is no allowlist: a page is the new build or it is not.
import {
  addPage,
  candidateRoutes,
  internalPath,
  mutateFile,
  NEW_PAGE,
  postFiles,
  srcsetUrls,
} from "../lib/html.mjs";

const NEXT_IDS = ["__next", "__NEXT_DATA__"];
const isNextPath = (pathname) =>
  pathname === "/_next" || pathname.startsWith("/_next/");

/** What gives a page away as a Next.js page, in document order. */
function traces($, route) {
  const found = [];
  for (const id of NEXT_IDS) if ($(`[id="${id}"]`).length) found.push(`#${id}`);

  const references = new Set();
  for (const el of $("[href], [src], [srcset]").toArray()) {
    const values = [
      el.attribs.href,
      el.attribs.src,
      ...srcsetUrls(el.attribs.srcset),
    ].filter((value) => value !== undefined);
    for (const value of values) {
      const pathname = internalPath(value, route);
      if (pathname !== null && isNextPath(pathname)) references.add(pathname);
    }
  }
  if (references.size) {
    const [first] = references;
    found.push(
      `${references.size} reference${references.size > 1 ? "s" : ""} into /_next/ (${first}${references.size > 1 ? ", …" : ""})`,
    );
  }
  return found;
}

export default {
  name: "migrated",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    const found = {};
    let pass = 0;

    const pages = candidateRoutes(ctx);
    if (pages.length === 0)
      failed.push({ route: "-", detail: "candidate has no HTML pages" });

    for (const route of pages) {
      const $ = await ctx.dom("candidate", route);
      if ($ === null) {
        failed.push({ route, detail: "page missing in candidate" });
        cells[route] = "fail";
        continue;
      }
      const seen = traces($, route);
      if (seen.length === 0) {
        pass++;
        cells[route] = "pass";
        continue;
      }
      found[route] = seen;
      failed.push({
        route,
        detail: `this is a Next.js page: ${seen.join("; ")}`,
      });
      cells[route] = "fail";
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { pages: pages.length, found },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "Next.js 루트 요소(#__next) 추가",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(/(<body[^>]*>)/, '$1<div id="__next"></div>'),
          );
        },
      },
      {
        name: "/_next/ 스크립트 참조 추가",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(
              "</head>",
              '<script src="/_next/static/chunks/main.js" defer></script></head>',
            ),
          );
        },
      },
      {
        name: "기준선에 없는 새 글 페이지에 #__next 추가",
        apply(dir) {
          addPage(dir, postFiles(dir)[0], (html) =>
            html.replace(/(<body[^>]*>)/, '$1<div id="__next"></div>'),
          );
        },
        routes: [NEW_PAGE.route],
      },
      {
        name: "__NEXT_DATA__ 스크립트 추가",
        apply(dir) {
          mutateFile(dir, "404.html", (html) =>
            html.replace(
              "</body>",
              '<script id="__NEXT_DATA__" type="application/json">{}</script></body>',
            ),
          );
        },
      },
    ],
  },
};
