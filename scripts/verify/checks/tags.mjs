// tags — the tag pages say what the front matter says. Candidate-only (scope "feature"): the sources under posts/
// of this checkout decide the expected tags, and the baseline is not consulted.
//
// Expected, from the sources: every top-level posts/*.md that is not a draft (file name starting with "draft:", or a
// front matter `draft` key set to anything but false; posts/draft/ is never read) contributes its `keywords`
// ("a, b" → ["a", "b"]). The slug of a keyword is the rule of src/lib/tags.ts, written out again here so that
// the two have to agree: NFKC, lower case, every run of characters that are not letters, digits or marks → "-",
// no leading or trailing "-". Expected tag = slug → set of post ids.
//
// On the candidate (addresses compared percent-decoded, in NFC, without ".html"):
//   /tags/<slug>  one page per expected slug and no other page below /tags/. The set of /posts/<id> it links to
//                 equals the expected set: no post missing, no draft or untagged post added.
//   /tags         links to exactly the expected tag pages, each with "(<count>)" = the number of its posts.
//   /posts/<id>   the /tags/… links of each published post are exactly the slugs of its keywords, and each one
//                 answers 200 under GitHub Pages path resolution (an encoded and a raw Korean href both resolve).
// Expected slugs that collide (two spellings, one slug) or come out empty fail: the build is meant to stop on them.
// One failed item per wrong page. With --route only the selected pages are looked at.
//
// No allowlist: a tag page that disagrees with the front matter is a bug.
import fs from "node:fs";
import path from "node:path";

import {
  candidateRoutes,
  internalPath,
  listFiles,
  mutateFile,
  quote,
  statusOf,
} from "../lib/html.mjs";
import { repoRoot } from "../lib/paths.mjs";

const postsDir = path.join(repoRoot, "posts");
const INDEX = "/tags";

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---/;
const DRAFT = /^[ \t]*(["']?)draft\1[ \t]*:([^\n#]*)/im;
const KEYWORDS = /^[ \t]*(["']?)keywords\1[ \t]*:(.*)$/m;

/** The tag slug of a keyword (src/lib/tags.ts). */
export const slugOf = (keyword) =>
  keyword
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** A YAML scalar as written on one line: quoted or plain (a " #" starts a comment). */
function scalar(raw) {
  const text = raw.trim();
  const double = /^"((?:[^"\\]|\\.)*)"/.exec(text);
  if (double) {
    try {
      return JSON.parse(`"${double[1]}"`);
    } catch {
      return double[1];
    }
  }
  const single = /^'((?:[^']|'')*)'/.exec(text);
  if (single) return single[1].replaceAll("''", "'");
  return text.replace(/\s+#.*$/, "");
}

/** { published: [{ id, keywords }], drafts: [id] } from the top-level posts/*.md of this checkout. */
export function readSources() {
  const published = [];
  const drafts = [];
  for (const rel of listFiles(postsDir)) {
    if (rel.includes("/") || !/\.md$/i.test(rel)) continue;
    const id = rel.replace(/\.md$/i, "");
    const block =
      FRONT_MATTER.exec(
        fs.readFileSync(path.join(postsDir, rel), "utf8"),
      )?.[1] ?? "";
    const draft = DRAFT.exec(block);
    if (
      /^draft:/i.test(rel) ||
      (draft !== null && !/^(["']?)false\1$/i.test(draft[2].trim()))
    ) {
      drafts.push(id);
      continue;
    }
    const line = KEYWORDS.exec(block);
    const keywords = line
      ? scalar(line[2])
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean)
      : [];
    published.push({ id, keywords: [...new Set(keywords)] });
  }
  return { published, drafts };
}

/** Expected tags: Map slug → { labels: Set, ids: Set }. */
function expectedTags(published) {
  const tags = new Map();
  for (const { id, keywords } of published) {
    for (const keyword of keywords) {
      const slug = slugOf(keyword);
      const tag = tags.get(slug) ?? { labels: new Set(), ids: new Set() };
      tag.labels.add(keyword.normalize("NFC"));
      tag.ids.add(id);
      tags.set(slug, tag);
    }
  }
  return tags;
}

// ---------------------------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------------------------

/** Comparable form of a site path: percent-decoded, NFC, without ".html" and a trailing "/". */
function keyOf(pathname) {
  let text = pathname;
  try {
    text = decodeURIComponent(pathname);
  } catch {
    // keep as written
  }
  return (
    text
      .normalize("NFC")
      .replace(/\.html$/, "")
      .replace(/\/+$/, "") || "/"
  );
}

/** [{ pathname, key, text }] of the internal links of a page whose comparable path starts with `prefix`. */
function linksUnder($, route, prefix) {
  return $("a[href]")
    .toArray()
    .map((el) => {
      const pathname = internalPath($(el).attr("href"), route);
      return pathname === null
        ? null
        : { pathname, key: keyOf(pathname), text: $(el).text() };
    })
    .filter((link) => link !== null && link.key.startsWith(prefix));
}

const tail = (key, prefix) => key.slice(prefix.length);

/** "missing a, b; extra c" for two sets, or "" when they are equal. */
function setDiff(expected, actual) {
  const missing = [...expected].filter((item) => !actual.has(item));
  const extra = [...actual].filter((item) => !expected.has(item));
  return [
    missing.length ? `missing ${missing.join(", ")}` : "",
    extra.length ? `extra ${extra.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

// ---------------------------------------------------------------------------------------------

export default {
  name: "tags",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    let pass = 0;
    const result = (route, problems) => {
      if (problems.length === 0) {
        pass++;
        cells[route] = "pass";
      } else {
        failed.push({ route, detail: problems.join(" | ") });
        cells[route] = "fail";
      }
    };

    if (ctx.candidateUrl)
      return {
        ok: false,
        pass: 0,
        fail: 1,
        failed: [
          {
            route: "-",
            detail: "tags reads a directory and cannot check a deployed site",
          },
        ],
      };

    const { published, drafts } = readSources();
    const expected = expectedTags(published);
    for (const [slug, tag] of expected) {
      if (slug === "")
        failed.push({
          route: "-",
          detail: `keywords with an empty slug: ${[...tag.labels].map((l) => quote(l)).join(", ")}`,
        });
      else if (tag.labels.size > 1)
        failed.push({
          route: `/tags/${slug}`,
          detail: `keywords collide on one slug: ${[...tag.labels].map((l) => quote(l)).join(", ")}`,
        });
    }
    if (expected.size === 0)
      failed.push({
        route: "-",
        detail: "no published post has keywords: there is nothing to assert",
      });

    const narrowed = (ctx.args?.route ?? []).length > 0;
    const routes = candidateRoutes(ctx);
    const keyed = new Map(routes.map((route) => [keyOf(route), route]));

    // 1. every expected tag has a page (whole site only)
    if (!narrowed)
      for (const slug of expected.keys())
        if (!keyed.has(`/tags/${slug}`))
          failed.push({
            route: `/tags/${slug}`,
            detail: `no tag page for ${quote([...expected.get(slug).labels][0])}`,
          });

    // 2. tag pages: the posts they list
    for (const route of routes) {
      const key = keyOf(route);
      if (!key.startsWith("/tags/")) continue;
      const slug = tail(key, "/tags/");
      const tag = expected.get(slug);
      if (!tag) {
        result(route, [
          `tag page for no keyword of a published post (drafts: ${drafts.length})`,
        ]);
        continue;
      }
      const $ = await ctx.dom("candidate", route);
      const listed = new Set(
        linksUnder($, route, "/posts/").map((link) =>
          tail(link.key, "/posts/"),
        ),
      );
      const diff = setDiff(tag.ids, listed);
      result(route, diff ? [`posts ${diff}`] : []);
    }

    // 3. /tags: links and counts
    if (keyed.has(INDEX)) {
      const route = keyed.get(INDEX);
      const $ = await ctx.dom("candidate", route);
      const problems = [];
      const links = linksUnder($, route, "/tags/");
      const shown = new Set(links.map((link) => tail(link.key, "/tags/")));
      const diff = setDiff(new Set(expected.keys()), shown);
      if (diff) problems.push(`tags ${diff}`);
      for (const link of links) {
        const tag = expected.get(tail(link.key, "/tags/"));
        const count = /\((\d+)\)/.exec(link.text)?.[1];
        if (tag && Number(count) !== tag.ids.size)
          problems.push(
            `${link.key} shows count ${count ?? "none"}, expected ${tag.ids.size}`,
          );
        if ((await statusOf(ctx, "candidate", link.pathname)) !== 200)
          problems.push(`${link.pathname} does not answer 200`);
      }
      result(route, problems);
    } else if (!narrowed)
      failed.push({ route: INDEX, detail: "no tag index page" });

    // 4. post pages: their tag links
    const byId = new Map(published.map((post) => [post.id, post]));
    for (const route of routes) {
      const key = keyOf(route);
      if (!key.startsWith("/posts/")) continue;
      const post = byId.get(tail(key, "/posts/"));
      if (!post) continue; // not a published source: the drafts check owns that
      const $ = await ctx.dom("candidate", route);
      const links = linksUnder($, route, "/tags/");
      const problems = [];
      const diff = setDiff(
        new Set(post.keywords.map(slugOf)),
        new Set(links.map((link) => tail(link.key, "/tags/"))),
      );
      if (diff) problems.push(`tag links ${diff}`);
      for (const link of links)
        if ((await statusOf(ctx, "candidate", link.pathname)) !== 200)
          problems.push(`${link.pathname} does not answer 200`);
      result(route, problems);
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: {
        tags: Object.fromEntries(
          [...expected].map(([slug, tag]) => [slug, [...tag.ids]]),
        ),
        drafts,
      },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "태그 페이지에서 글 하나 삭제",
        apply(dir) {
          mutateFile(dir, "tags/css.html", (html) =>
            html.replace(/<article[^>]*>[\s\S]*?<\/article>/, ""),
          );
        },
      },
      {
        name: "태그 페이지에 그 태그가 없는 글 추가",
        apply(dir) {
          const other = readSources().published.find(
            (post) => !post.keywords.map(slugOf).includes("css"),
          );
          mutateFile(dir, "tags/css.html", (html) =>
            html.replace(
              "</section>",
              `<article><a href="/posts/${other.id}"><h2>x</h2></a></article></section>`,
            ),
          );
        },
      },
      {
        name: "어느 글의 키워드도 아닌 태그 페이지",
        apply(dir) {
          fs.copyFileSync(
            path.join(dir, "tags", "css.html"),
            path.join(dir, "tags", "초안-태그.html"),
          );
        },
      },
      {
        name: "태그 페이지에 posts/draft/ 의 초안 추가",
        apply(dir) {
          const draft = listFiles(path.join(postsDir, "draft"))[0].replace(
            /\.md$/i,
            "",
          );
          mutateFile(dir, "tags/css.html", (html) =>
            html.replace(
              "</section>",
              `<article><a href="/posts/${encodeURIComponent(draft)}"><h2>x</h2></a></article></section>`,
            ),
          );
        },
      },
      {
        name: "한글 태그 페이지 삭제",
        apply(dir) {
          const rel = listFiles(path.join(dir, "tags")).find((name) =>
            /[가-힣]/.test(name),
          );
          fs.rmSync(path.join(dir, "tags", rel));
        },
      },
      {
        name: "/tags 의 글 수 변경",
        apply(dir) {
          mutateFile(dir, "tags.html", (html) =>
            html.replace(/\((\d+)\)/, (_, n) => `(${Number(n) + 1})`),
          );
        },
      },
      {
        name: "글의 태그 링크를 없는 주소로",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week1.html", (html) =>
            html.replace(
              /href="\/tags\/%[^"]*"/,
              'href="/tags/%EC%97%86%EB%8A%94"',
            ),
          );
        },
        routes: ["/posts/css-masters-2-week1"],
      },
    ],
    accepted: [
      {
        name: "글의 한글 태그 링크를 인코딩하지 않고 적음",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week1.html", (html) =>
            html.replace(
              /href="(\/tags\/%[^"]*)"/g,
              (_, href) => `href="${decodeURIComponent(href)}"`,
            ),
          );
        },
      },
    ],
  },
};
