// series — a post that belongs to a series shows where it stands in it and links to its neighbours, in the exact
// order. Candidate-only (scope "feature"): the old site had no series navigation.
//
// The expected series are written down here (SERIES), not read from src/content/series.json, so that a wrong order
// in the data file is caught instead of copied.
//
// For each post page of the candidate (/posts/<id>):
//   in a series   exactly one <nav aria-label="시리즈">, whose label (its <p>) reads "시리즈: <name> (n/N)";
//                 exactly one a[rel~=prev] in it pointing at the previous post, none on the first post;
//                 exactly one a[rel~=next] in it pointing at the next post, none on the last post
//   otherwise     no <nav aria-label="시리즈"> at all
// Links are compared as site paths without ".html". Every post of SERIES must be a page of the candidate
// (unless --route narrows the run). One failed item per route, listing every problem.
//
// No allowlist: a series is either in the right order or not.
import {
  addPage,
  candidateRoutes,
  collapse,
  internalPath,
  mutateFile,
  NEW_PAGE,
  quote,
  textOf,
} from "../lib/html.mjs";

const SERIES = [
  {
    name: "css-masters-2",
    posts: [
      "css-masters-2-week1",
      "css-masters-2-week2",
      "css-masters-2-week3",
      "css-masters-2-week4",
    ],
  },
];

const NAV = 'nav[aria-label="시리즈"]';

/** Where each post stands: route → { name, index, posts }. */
const positions = new Map(
  SERIES.flatMap(({ name, posts }) =>
    posts.map((id, index) => [`/posts/${id}`, { name, index, posts }]),
  ),
);

const pageKey = (pathname) =>
  pathname.replace(/(?:\/index)?\.html$/, "").replace(/\/+$/, "") || "/";

/** Problems of one link direction: `want` is the expected post id or null for none. */
function linkProblems($, nav, route, rel, want) {
  const links = nav.find(`a[rel~="${rel}"]`).toArray();
  const expected = want === null ? null : `/posts/${want}`;
  if (expected === null)
    return links.length === 0
      ? []
      : [`has ${links.length} ${rel} link(s), expected none`];
  if (links.length !== 1)
    return [`has ${links.length} ${rel} link(s), expected 1 → ${expected}`];
  const href = $(links[0]).attr("href");
  const target = internalPath(href, route);
  if (target === null || pageKey(decodeURI(target)) !== expected)
    return [`${rel} link ${quote(href)} does not point at ${expected}`];
  if (!collapse(textOf(links[0])))
    return [`${rel} link to ${expected} has no text`];
  return [];
}

function problemsOf($, route) {
  const navs = $(NAV);
  const at = positions.get(route);
  if (!at)
    return navs.length === 0
      ? []
      : [`not in a series but has ${navs.length} series nav(s)`];
  if (navs.length !== 1)
    return [`has ${navs.length} series nav(s), expected 1`];

  const nav = navs.first();
  const { name, index, posts } = at;
  const problems = [];
  const label = collapse(textOf(nav.find("p").first()[0] ?? { children: [] }));
  const want = `시리즈: ${name} (${index + 1}/${posts.length})`;
  if (label !== want) problems.push(`label ${quote(label)} ≠ ${quote(want)}`);
  problems.push(
    ...linkProblems($, nav, route, "prev", index > 0 ? posts[index - 1] : null),
    ...linkProblems(
      $,
      nav,
      route,
      "next",
      index < posts.length - 1 ? posts[index + 1] : null,
    ),
  );
  return problems;
}

export default {
  name: "series",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    let pass = 0;

    const routes = candidateRoutes(ctx).filter((route) =>
      route.startsWith("/posts/"),
    );
    const narrowed = (ctx.args?.route ?? []).length > 0;
    if (!narrowed)
      for (const route of positions.keys())
        if (!routes.includes(route)) {
          failed.push({ route, detail: "series post missing in candidate" });
          cells[route] = "fail";
        }

    for (const route of routes) {
      const $ = await ctx.dom("candidate", route);
      const problems =
        $ === null ? ["page could not be read"] : problemsOf($, route);
      if (problems.length === 0) {
        pass++;
        cells[route] = "pass";
      } else {
        failed.push({ route, detail: problems.join("; ") });
        cells[route] = "fail";
      }
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { series: SERIES },
    };
  },

  selftest: {
    mutations: [
      {
        name: "2주차의 다음 글을 4주차로",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week2.html", (html) =>
            html.replace(
              /(<a[^>]*href="\/posts\/)css-masters-2-week3/,
              "$1css-masters-2-week4",
            ),
          );
        },
        routes: ["/posts/css-masters-2-week2"],
      },
      {
        name: "1주차에 이전 글 링크 추가",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week1.html", (html) =>
            html.replace(
              /(<nav[^>]*aria-label="시리즈"[^>]*>)/,
              '$1<a rel="prev" href="/posts/css-masters-2-week4">x</a>',
            ),
          );
        },
        routes: ["/posts/css-masters-2-week1"],
      },
      {
        name: "4주차의 순번을 3/4 로",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week4.html", (html) =>
            html.replace("(4/4)", "(3/4)"),
          );
        },
        routes: ["/posts/css-masters-2-week4"],
      },
      {
        name: "3주차의 시리즈 탐색 삭제",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week3.html", (html) =>
            html.replace(/aria-label="시리즈"/, 'aria-label="x"'),
          );
        },
        routes: ["/posts/css-masters-2-week3"],
      },
      {
        name: "기준선에 없는 새 글 페이지에 시리즈 탐색 추가",
        apply(dir) {
          addPage(dir, "posts/proxy-to-built-in-objects.html", (html) =>
            html.replace(
              "</main>",
              '</main><nav aria-label="시리즈"><p>시리즈: x (1/1)</p></nav>',
            ),
          );
        },
        routes: [NEW_PAGE.route],
      },
    ],
  },
};
