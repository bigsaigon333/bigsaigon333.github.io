// listed — the sitemap of the candidate lists the pages the candidate serves. Candidate-only.
//
// The sitemap check compares <loc> sets with the baseline and accepts, by an allowlist entry, the newest post:
// the deployed sitemap is a stale committed file without it. That comparison cannot tell whether the new
// sitemap really lists the post — a candidate sitemap without it equals the baseline's. So, on the candidate alone:
//
//   - every HTML page has exactly one <loc> whose path is the page's route; the error page (/404) has none
//   - every <loc> answers 200 under GitHub Pages path resolution
//
// With --route only the first rule is applied, to the selected pages.
// Scope "feature": the baseline fails it (that stale file), so the self-test runs it against dist/.
// There is no allowlist.
import { load } from "cheerio";

import {
  addPage,
  candidateRoutes,
  mutateFile,
  NEW_PAGE,
  postFiles,
  rawText,
  statusOf,
} from "../lib/html.mjs";
import { inspectXml } from "../lib/xml.mjs";

const ERROR_PAGE = "/404";

/** Route a <loc> points at ("https://host" → "/", "https://host/posts/a" → "/posts/a"), or null when it is no URL. */
function routeOf(loc) {
  try {
    return decodeURI(new URL(loc).pathname);
  } catch {
    return null;
  }
}

export default {
  name: "listed",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    let pass = 0;

    const xml = await ctx.html("candidate", "/sitemap.xml");
    if (xml === null)
      return {
        ok: false,
        pass: 0,
        fail: 1,
        failed: [{ route: "/sitemap.xml", detail: "missing in candidate" }],
      };
    const { problem } = inspectXml(xml);
    if (problem)
      failed.push({
        route: "/sitemap.xml",
        detail: `not well-formed XML: ${problem}`,
      });

    const $ = load(xml, { xmlMode: true });
    const locs = $("url > loc")
      .toArray()
      .map((el) => rawText(el).trim());
    const listed = new Map(); // route → the <loc> values that point at it
    for (const loc of locs) {
      const route = routeOf(loc);
      listed.set(route, [...(listed.get(route) ?? []), loc]);
    }

    // 1. every page is listed once, the error page not at all
    const pages = candidateRoutes(ctx);
    for (const route of pages) {
      const hits = listed.get(route) ?? [];
      const wanted = route === ERROR_PAGE ? 0 : 1;
      if (hits.length === wanted) {
        pass++;
        cells[route] = "pass";
        continue;
      }
      failed.push({
        route,
        detail:
          route === ERROR_PAGE
            ? `the error page is in the candidate's sitemap.xml: ${hits.join(", ")}`
            : hits.length === 0
              ? "page is not in the candidate's sitemap.xml"
              : `page is in the candidate's sitemap.xml ${hits.length} times: ${hits.join(", ")}`,
      });
      cells[route] = "fail";
    }

    // 2. every entry is a page (the whole sitemap, so only when the run is not narrowed to some routes)
    if ((ctx.args?.route ?? []).length === 0) {
      for (const [route, hits] of listed) {
        if (route === ERROR_PAGE) continue; // reported above
        let reason = null;
        if (route === null) reason = "is not a URL";
        else {
          const status = await statusOf(ctx, "candidate", route);
          if (status !== 200) reason = `answers ${status}`;
        }
        if (reason)
          failed.push({
            route: "/sitemap.xml",
            detail: `loc ${hits[0]} ${reason}`,
          });
      }
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { pages: pages.length, locs: locs.length },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        // The newest post is the first <url> after the home page: the entry the sitemap check has to allowlist.
        name: "sitemap 에서 가장 최근 글 삭제",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /<url><loc>[^<]*\/posts\/[^<]*<\/loc>.*?<\/url>\s*/,
              "",
            ),
          );
        },
      },
      {
        // The page is a copy of a post that the sitemap does not list under the new address.
        name: "sitemap 에 없는, 기준선에 없는 새 글 페이지",
        apply(dir) {
          addPage(dir, postFiles(dir)[0]);
        },
        routes: [NEW_PAGE.route],
      },
      {
        name: "sitemap 에서 홈 삭제",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /<url><loc>https?:\/\/[^/<]*\/?<\/loc>.*?<\/url>\s*/,
              "",
            ),
          );
        },
      },
      {
        name: "sitemap 에 없는 페이지 추가",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /<url><loc>(https?:\/\/[^/<]*)\/?<\/loc>/,
              "<url><loc>$1/posts/no-such-post</loc></url>\n$&",
            ),
          );
        },
      },
      {
        name: "sitemap 에 같은 글 두 번",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /<url><loc>[^<]*\/posts\/[^<]*<\/loc>.*?<\/url>\s*/,
              "$&$&",
            ),
          );
        },
      },
      {
        name: "sitemap 에 404 페이지 추가",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /<url><loc>(https?:\/\/[^/<]*)\/?<\/loc>/,
              "<url><loc>$1/404</loc></url>\n$&",
            ),
          );
        },
      },
    ],
  },
};
