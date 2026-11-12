// content — what a reader gets from the page body, independent of markup details.
//
// Posts ("/posts/<id>": header, article with h2 + time, main with the rendered Markdown, footer):
//   - text      normalized text of <main>, exact (whitespace runs → one space, trimmed; block boundaries and <br>
//               count as whitespace). Every rendered formula is first replaced by a token of its TeX source, so the
//               KaTeX version does not matter but the formula does.
//   - structure ordered lists inside <main>: headings (level + text, ids ignored), pre blocks (exact text after
//               normalizing line endings and one trailing newline), a[href], img (src, alt, width), table cells,
//               checkboxes, del, footnote references and definitions; counts of details/summary/br/table rows.
//   - header    article h2 text, time datetime + text; footer text.
// Home ("/"): ordered list of (a href, h2 text, time datetime, time text) per article, and the footer text.
// Any other route: normalized text of <body>.
//
// Only element names and attributes are used to find things — no class names, ids or wrapper divs — so the same
// extraction works on the Next.js baseline and on an Astro build. One failed item per route.
//
// Allowlist item: "route:<route>".
import {
  allowances,
  collapse,
  diffList,
  diffText,
  mutateFile,
  mutateFirst,
  postFiles,
  quote,
  rawText,
  replaceInMain,
  textOf,
  tokenizeMath,
} from "../lib/html.mjs";

const text = (node) => collapse(textOf(node));
const attr = (el, name) => el?.attribs?.[name] ?? null;
const preText = (el) => rawText(el).replace(/\r\n?/g, "\n").replace(/\n$/, "");

/** Last <footer> that is not part of the rendered Markdown. */
const footerOf = ($) =>
  $("footer")
    .toArray()
    .filter((el) => $(el).closest("main").length === 0)
    .at(-1);

function homeSnapshot($) {
  const posts = $("article")
    .toArray()
    .map((article) => {
      const heading = $(article).find("h2").first();
      const link = heading.closest("a[href]").length ? heading.closest("a[href]") : heading.find("a[href]").first();
      const time = $(article).find("time[datetime]").first();
      return [
        link.attr("href") ?? "(no link)",
        text(heading[0]),
        time.attr("datetime") ?? "(no datetime)",
        text(time[0]),
      ].join(" | ");
    });
  return { posts, footer: text(footerOf($)) };
}

function postSnapshot($) {
  const main = $("main").first();
  const find = (selector) => main.find(selector).toArray();
  const count = (selector) => main.find(selector).length;

  const header = $(
    $("article")
      .toArray()
      .filter((el) => $(el).closest("main").length === 0)
      .slice(0, 1),
  );
  const time = header.find("time[datetime]").first();

  // A footnote reference is an in-page link in a <sup>; its definition is whatever element that link points to.
  const references = find('sup a[href^="#"], a[data-footnote-ref]');
  const targets = new Map(find("[id]").map((el) => [el.attribs.id, el]));
  const definitions = [...new Set(references.map((el) => attr(el, "href")).filter(Boolean))].map((href) => {
    let id = href.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // keep the raw fragment
    }
    return targets.has(id) ? text(targets.get(id)) : `(no element for ${href})`;
  });

  return {
    title: text(header.find("h2")[0]),
    time: `${time.attr("datetime") ?? "(no datetime)"} | ${text(time[0])}`,
    main: `${$("main").length} <main>`,
    text: text(main[0]),
    headings: find("h1, h2, h3, h4, h5, h6").map((el) => `${el.name} ${text(el)}`),
    pre: find("pre").map(preText),
    links: find("a[href]").map((el) => attr(el, "href")),
    images: find("img").map((el) =>
      ["src", "alt", "width"].map((name) => `${name}: ${attr(el, name) ?? "(none)"}`).join(" | "),
    ),
    cells: find("th, td").map((el) => `${el.name} ${text(el)}`),
    checkboxes: find('input[type="checkbox"]').map((el) => (attr(el, "checked") === null ? "unchecked" : "checked")),
    del: find("del").map(text),
    "footnote refs": references.map(text),
    "footnote defs": definitions,
    counts: ["details", "summary", "details[open]", "br", "table", "tr"].map(
      (selector) => `${selector} × ${count(selector)}`,
    ),
    footer: text(footerOf($)),
  };
}

const bodySnapshot = ($) => ({ text: text($("body")[0]) });

/** Element counts inside <main>, for the report only (helps to explain a visual difference). */
function tagCounts($) {
  const counts = {};
  for (const el of $("main").first().find("*").toArray()) counts[el.name] = (counts[el.name] ?? 0) + 1;
  return counts;
}

function compare(before, after) {
  const differing = [];
  for (const [name, baseline] of Object.entries(before)) {
    const candidate = after[name];
    if (Array.isArray(baseline)) {
      const diff = diffList(name, baseline, candidate);
      if (diff) differing.push(diff);
    } else if (baseline !== candidate) {
      const short = baseline.length <= 60 && candidate.length <= 60;
      differing.push(
        short ? `${name}: ${quote(baseline)} → ${quote(candidate)}` : `${name} ${diffText(baseline, candidate)}`,
      );
    }
  }
  return differing;
}

export default {
  name: "content",
  kind: "static",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "content");
    const failed = [];
    const cells = {};
    const diffs = {};
    const tags = {};
    let pass = 0;

    for (const route of ctx.routes) {
      const baseline = await ctx.dom("baseline", route);
      const candidate = await ctx.dom("candidate", route);

      let differing;
      if (candidate === null) differing = ["route missing in candidate"];
      else {
        const snapshot = route === "/" ? homeSnapshot : baseline("main").length ? postSnapshot : bodySnapshot;
        tokenizeMath(baseline, baseline("body"));
        tokenizeMath(candidate, candidate("body"));
        differing = compare(snapshot(baseline), snapshot(candidate));

        if (snapshot === postSnapshot) {
          const before = tagCounts(baseline);
          const after = tagCounts(candidate);
          const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
            .sort()
            .filter((tag) => before[tag] !== after[tag])
            .map((tag) => [tag, [before[tag] ?? 0, after[tag] ?? 0]]);
          if (changed.length) tags[route] = Object.fromEntries(changed);
        }
      }

      if (differing.length === 0) {
        pass++;
        cells[route] = "pass";
        continue;
      }
      diffs[route] = differing;
      const detail =
        differing.slice(0, 4).join("; ") + (differing.length > 4 ? ` (+${differing.length - 4} more)` : "");
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
      // tagCounts: element counts inside <main> that differ, as [baseline, candidate]. Informational, never a failure.
      extra: { allowed, diffs, tagCounts: tags },
    };
  },

  selftest: {
    mutations: [
      {
        name: "본문 문단 삭제",
        apply(dir) {
          mutateFirst(dir, postFiles(dir), (html) => replaceInMain(html, /<p>[\s\S]*?<\/p>/, ""));
        },
      },
      {
        name: "코드 블록 들여쓰기 변경",
        apply(dir) {
          mutateFirst(dir, postFiles(dir), (html) => replaceInMain(html, /(<pre><code[^>]*>)/, "$1  "));
        },
      },
      {
        name: "링크 href 변경",
        apply(dir) {
          mutateFirst(dir, postFiles(dir), (html) => replaceInMain(html, /<a href="([^"#][^"]*)"/, '<a href="$1-x"'));
        },
      },
      {
        name: "수식 TeX 원문 변경",
        apply(dir) {
          mutateFirst(dir, postFiles(dir), (html) =>
            replaceInMain(html, /(<annotation encoding="application\/x-tex">)([^<]*)/, "$1$2+1"),
          );
        },
      },
      {
        name: "글 머리 제목 변경",
        apply(dir) {
          mutateFirst(dir, postFiles(dir), (html) => html.replace(/(<article[^>]*><h2>)/, "$1!"));
        },
      },
      {
        name: "홈 글 날짜 변경",
        apply(dir) {
          // React writes the attribute as dateTime; HTML attribute names are case-insensitive.
          mutateFile(dir, "index.html", (html) =>
            html.replace(/<time datetime="[^"]*"/i, '<time datetime="1999-01-01T00:00:00.000Z"'),
          );
        },
      },
    ],
  },
};
