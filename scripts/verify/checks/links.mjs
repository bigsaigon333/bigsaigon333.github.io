// links — nothing on the candidate points into the void. Candidate-only; the baseline is not consulted.
//
// In every HTML page of the candidate, each internal reference must answer 200 under GitHub Pages path resolution
// (lib/resolve.mjs): a[href], link[href], script[src], img[src], source[src] and every srcset entry.
// Internal = root-relative ("/x", but not "//host") or document-relative. Query and fragment are ignored;
// fragment-only links and other origins are not checked. A 301 (directory without trailing slash) is a failure too.
// One failed item per page.
//
// Allowlist item: "ref:<pathname>" (a trailing ** matches by prefix).
import {
  allowances,
  candidateRoutes,
  internalPath,
  mutateFile,
  srcsetUrls,
  statusOf,
} from "../lib/html.mjs";

const SOURCES = [
  ["a[href]", "href", false],
  ["link[href]", "href", false],
  ["script[src]", "src", false],
  ["img[src]", "src", false],
  ["source[src]", "src", false],
  ["source[srcset]", "srcset", true],
  ["img[srcset]", "srcset", true],
];

/** Distinct internal pathnames referenced by a page, in document order per source kind. */
function internalReferences($, route) {
  const paths = new Set();
  for (const [selector, attribute, isSet] of SOURCES) {
    for (const el of $(selector).toArray()) {
      const value = $(el).attr(attribute);
      for (const reference of isSet ? srcsetUrls(value) : [value]) {
        const pathname = internalPath(reference, route);
        if (pathname !== null) paths.add(pathname);
      }
    }
  }
  return [...paths];
}

export default {
  name: "links",
  kind: "static",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "links");
    const failed = [];
    const cells = {};
    const broken = {};
    let pass = 0;
    let references = 0;

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

      const bad = [];
      for (const pathname of internalReferences($, route)) {
        references++;
        const status = await statusOf(ctx, "candidate", pathname);
        if (status === 200) continue;
        const problem = `${pathname} (${status})`;
        if (!skip(`ref:${pathname}`, `${route}: ${status}`)) bad.push(problem);
      }

      if (bad.length === 0) {
        pass++;
        cells[route] = "pass";
        continue;
      }
      broken[route] = bad;
      const shown =
        bad.slice(0, 5).join(", ") +
        (bad.length > 5 ? ` (+${bad.length - 5} more)` : "");
      failed.push({
        route,
        detail: `${bad.length} broken internal reference${bad.length > 1 ? "s" : ""}: ${shown}`,
      });
      cells[route] = "fail";
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { allowed, pages: pages.length, references, broken },
    };
  },

  selftest: {
    mutations: [
      {
        name: "없는 페이지로 가는 링크 삽입",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(
              "</footer>",
              '<a href="/posts/no-such-post"></a></footer>',
            ),
          );
        },
      },
      {
        name: "없는 이미지 참조 삽입",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(
              "</footer>",
              '<img src="/no-such-image.png" alt=""></footer>',
            ),
          );
        },
      },
    ],
  },
};
