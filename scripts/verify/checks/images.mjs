// images — every image a page shows comes from this site and went through astro:assets. Candidate-only
// (scope "feature"): it reads the new build and never the baseline.
//
// For every <img> and every <source> inside a <picture> of every candidate page:
//   same origin   src and every srcset URL are site-relative (no "https:", no "//host"); a remote image would be
//                 a request to another origin and is never resized
//   optimized     each of those URLs is under /_astro/, where astro:assets writes what it produced. A file left in
//                 public/ (or a raw "./images/x.png" that the Markdown pipeline did not pick up) is served as it is
//   served        each of those URLs answers 200
// and for every <img>
//   alt           an alt attribute is present (empty is allowed: a decorative image)
//   box           width and height are positive integers, so the browser reserves the box before the file arrives
//
// One failed item per page, listing every problem on it. Fails as well when no page has an image at all
// (finding nothing means this does not see what it should). There is no allowlist.
import { load } from "cheerio";

import {
  candidateRoutes,
  editPages,
  internalPath,
  srcsetUrls,
  statusOf,
} from "../lib/html.mjs";

const ASSETS = "/_astro/";
const DIMENSION = /^[1-9]\d*$/;

/** Problems of one URL an image element references, from page `route`. */
async function urlProblems(ctx, route, url, where) {
  const pathname = internalPath(url, route);
  if (pathname === null) return [`${where} ${url} is not on this site`];
  if (!pathname.startsWith(ASSETS))
    return [`${where} ${url} is not an astro:assets output (${ASSETS}…)`];
  const status = await statusOf(ctx, "candidate", pathname);
  return status === 200 ? [] : [`${where} ${url} answers ${status}`];
}

export default {
  name: "images",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    let pass = 0;
    let images = 0;

    const routes = candidateRoutes(ctx);
    for (const route of routes) {
      const html = await ctx.html("candidate", route);
      if (html === null) {
        failed.push({ route, detail: "page missing in candidate" });
        cells[route] = "fail";
        continue;
      }
      const $ = load(html);
      const problems = [];

      const elements = $("img, picture > source").toArray();
      for (const [index, el] of elements.entries()) {
        const tag = el.tagName;
        const name = `${tag}[${index}]`;
        const src = $(el).attr("src");
        const srcset = $(el).attr("srcset");
        if (tag === "img") {
          images++;
          if (src === undefined || src.trim() === "")
            problems.push(`${name} has no src`);
          if ($(el).attr("alt") === undefined)
            problems.push(`${name} has no alt`);
          for (const key of ["width", "height"]) {
            const value = $(el).attr(key);
            if (value === undefined || !DIMENSION.test(value.trim()))
              problems.push(`${name} ${key}=${value ?? "(none)"}`);
          }
        } else if (srcsetUrls(srcset).length === 0) {
          problems.push(`${name} has no srcset`);
        }
        const urls = [
          ...(src && src.trim() ? [[src.trim(), `${name} src`]] : []),
          ...srcsetUrls(srcset).map((url) => [url, `${name} srcset`]),
        ];
        for (const [url, where] of urls)
          problems.push(...(await urlProblems(ctx, route, url, where)));
      }

      if (problems.length === 0) {
        pass++;
        cells[route] = "pass";
      } else {
        failed.push({ route, detail: problems.join("; ") });
        cells[route] = "fail";
      }
    }

    if (routes.length > 0 && images === 0)
      failed.push({
        route: "-",
        detail: "no page has an <img>: this check sees nothing",
      });

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { pages: routes.length, images },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "본문 이미지를 원격 주소로",
        apply(dir) {
          editPages(
            dir,
            /(<main[\s\S]*?<img\b[^>]*?\bsrc=")[^"]*(")/,
            "$1https://user-images.githubusercontent.com/31029000/x.png$2",
          );
        },
      },
      {
        // What a raw HTML <img> looks like when the Markdown pipeline passes it by: the path stays as written.
        name: "본문 이미지가 최적화되지 않은 상대 경로",
        apply(dir) {
          editPages(
            dir,
            /(<main[\s\S]*?<img\b[^>]*?\bsrc=")[^"]*(")/,
            "$1./images/x.png$2",
          );
        },
      },
      {
        name: "public/ 의 원본 그대로(최적화 안 됨)",
        apply(dir) {
          editPages(
            dir,
            /srcset="\/_astro\/profile[^" ]*/,
            'srcset="/profile.webp',
          );
        },
      },
      {
        name: "srcset 의 2x 파일이 없다",
        apply(dir) {
          editPages(dir, /(\/_astro\/[^" ]*)( 2x)/, "$1-missing.webp$2");
        },
      },
      {
        name: "img 의 alt 삭제",
        apply(dir) {
          editPages(dir, /(<main[\s\S]*?<img\b[^>]*?)\salt="[^"]*"/, "$1");
        },
      },
      {
        name: "img 의 width 삭제",
        apply(dir) {
          editPages(dir, /(<main[\s\S]*?<img\b[^>]*?)\swidth="\d+"/, "$1");
        },
      },
      {
        name: "이미지가 하나도 없다",
        apply(dir) {
          editPages(dir, /<img\b[^>]*>/g, "");
        },
      },
    ],
  },
};
