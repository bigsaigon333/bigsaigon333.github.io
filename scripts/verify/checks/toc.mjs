// toc — the table of contents and the reading time of every post page agree with the body. Candidate-only
// (scope "feature"): the baseline has neither.
//
// For every post route of the candidate ("/posts/<id>"):
//   body headings  every h2 and h3 inside <main>, in document order. Each needs a non-empty id.
//   toc            <nav aria-label="목차"> outside <main>. With 2 or more body headings there is exactly one, without
//                  them none. Its links, in document order, are exactly the body headings: href "#<id>" of the heading
//                  at the same position and the same text. Text is normalized whitespace after every rendered formula
//                  is replaced by a token of its TeX source (lib/html.mjs tokenizeMath), on both sides.
//   targets        every href "#<id>" of the toc names exactly one element of the page (id compared percent-decoded).
//   reading time   exactly one element outside <main> whose own text is "읽는 시간 약 <N>분", N a whole number ≥ 1.
// One failed item per route, listing every problem.
//
// Allowlist item: "route:<route>".
import { load } from "cheerio";

import {
  NEW_PAGE,
  addPage,
  allowances,
  candidateRoutes,
  collapse,
  mutateFile,
  postFiles,
  postRoutesWith,
  quote,
  replaceInMain,
  textOf,
  tokenizeMath,
} from "../lib/html.mjs";

const LABEL = "목차";
const READING_TIME = /^읽는 시간 약 [1-9]\d*분$/;

const text = (el) => collapse(textOf(el));
const outsideMain = ($, el) => $(el).closest("main").length === 0;

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Problems of one post page; [] when it is right. */
function problemsOf(html) {
  const $ = load(html);
  tokenizeMath($, $.root());
  const problems = [];

  const headings = $("main")
    .find("h2, h3")
    .toArray()
    .map((el) => ({ id: el.attribs.id ?? "", text: text(el), name: el.name }));
  for (const heading of headings.filter(({ id }) => id === ""))
    problems.push(`body ${heading.name} ${quote(heading.text)} has no id`);

  const navs = $("nav")
    .toArray()
    .filter((el) => el.attribs["aria-label"] === LABEL && outsideMain($, el));
  const wanted = headings.length >= 2 ? 1 : 0;
  if (navs.length !== wanted)
    problems.push(
      `${navs.length} nav[aria-label="${LABEL}"] for ${headings.length} body h2/h3, expected ${wanted}`,
    );

  if (navs.length === 1) {
    const links = $(navs[0])
      .find("a")
      .toArray()
      .map((el) => ({ href: el.attribs.href ?? "", text: text(el) }));
    const length = Math.max(links.length, headings.length);
    for (let i = 0; i < length; i++) {
      const link = links[i];
      const heading = headings[i];
      if (!link) {
        problems.push(
          `toc lacks entry ${i + 1}: #${heading.id} ${quote(heading.text)}`,
        );
        continue;
      }
      if (!heading) {
        problems.push(
          `toc entry ${i + 1} ${link.href} ${quote(link.text)} has no body heading`,
        );
        continue;
      }
      if (
        link.href !== `#${heading.id}` &&
        decode(link.href) !== `#${heading.id}`
      )
        problems.push(
          `toc entry ${i + 1} href ${quote(link.href)} ≠ #${heading.id}`,
        );
      if (link.text !== heading.text)
        problems.push(
          `toc entry ${i + 1} text ${quote(link.text)} ≠ ${quote(heading.text)}`,
        );
    }

    const ids = $("[id]")
      .toArray()
      .map((el) => el.attribs.id);
    for (const { href } of links) {
      if (!href.startsWith("#")) {
        problems.push(`toc link ${quote(href)} is not a fragment`);
        continue;
      }
      const target = decode(href.slice(1));
      const hits = ids.filter((id) => id === target || decode(id) === target);
      if (hits.length !== 1)
        problems.push(
          `toc target ${quote(href)} matches ${hits.length} elements, expected 1`,
        );
    }
  }

  const readingTimes = $("body *")
    .toArray()
    .filter(
      (el) =>
        outsideMain($, el) &&
        READING_TIME.test(
          collapse(
            (el.children ?? [])
              .map((child) => (child.type === "text" ? child.data : ""))
              .join(""),
          ),
        ),
    );
  if (readingTimes.length !== 1)
    problems.push(
      `${readingTimes.length} elements read "읽는 시간 약 N분" outside <main>, expected 1`,
    );

  return problems;
}

const isPost = (route) => /^\/posts\/[^/]+$/.test(route);

/** The first toc link of a page (the "#…" fragment), for mutations. */
const firstTocHref = (html) =>
  /<nav[^>]*aria-label="목차"[\s\S]*?<a href="(#[^"]*)"/.exec(html)?.[1];

export default {
  name: "toc",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "toc");
    const failed = [];
    const cells = {};
    let pass = 0;

    for (const route of candidateRoutes(ctx).filter(isPost)) {
      const html = await ctx.html("candidate", route);
      const problems =
        html === null ? ["route missing in candidate"] : problemsOf(html);
      if (problems.length === 0) {
        pass++;
        cells[route] = "pass";
        continue;
      }
      const detail = problems.join("; ");
      if (skip(`route:${route}`, detail)) cells[route] = "skip";
      else {
        failed.push({ route, detail });
        cells[route] = "fail";
      }
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: { allowed },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "목차 첫 링크의 대상을 없는 id 로",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(firstTocHref(html), "#no-such-heading"),
          );
        },
      },
      {
        name: "목차 첫 항목 삭제",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(
              /(<nav[^>]*aria-label="목차"[\s\S]*?<ol[^>]*>)<li[^>]*><a [^>]*>[\s\S]*?<\/a>/,
              "$1<li>",
            ),
          );
        },
      },
      {
        name: "본문 h2 의 글자 변경",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            replaceInMain(html, /(<h2 id="[^"]*"[^>]*>)/, "$1바뀐 "),
          );
        },
      },
      {
        name: "본문 제목의 id 를 한 번 더(대상이 둘)",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            replaceInMain(
              html,
              /<p>/,
              `<p><span id="${firstTocHref(html)?.slice(1)}"></span>`,
            ),
          );
        },
      },
      {
        name: "본문 h3 을 h4 로(목차가 본문보다 길다)",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            replaceInMain(html, /<h3( [^>]*>[\s\S]*?<\/)h3>/, "<h4$1h4>"),
          );
        },
        routes: (dir) => postRoutesWith(dir, /<main[\s\S]*<h3 /),
      },
      {
        name: "읽는 시간 삭제",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(/읽는 시간 약 \d+분/, ""),
          );
        },
      },
      {
        name: "본문 h2·h3 이 없는데 목차가 있다",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) => {
            const start = html.indexOf("<main");
            const end = html.indexOf("</main>");
            return (
              html.slice(0, start) +
              html.slice(start, end).replace(/<(\/?)h[23]\b/g, "<$1h5") +
              html.slice(end)
            );
          });
        },
      },
      {
        // A post the baseline does not have, as a pull request would add one: its toc has to be checked too.
        name: "기준선에 없는 새 글 페이지의 목차 삭제",
        apply(dir) {
          addPage(dir, postFiles(dir)[0], (html) =>
            html.replace(/<nav[^>]*aria-label="목차"[\s\S]*?<\/nav>/, ""),
          );
        },
        routes: [NEW_PAGE.route],
      },
    ],
    accepted: [
      {
        name: "목차를 펼쳐 둔다(<details open>)",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(
              /(<nav[^>]*aria-label="목차"[^>]*><details)/,
              "$1 open",
            ),
          );
        },
      },
    ],
  },
};
