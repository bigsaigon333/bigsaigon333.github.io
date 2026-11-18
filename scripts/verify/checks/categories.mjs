// categories — the category pages say what the front matter says. Candidate-only (scope "feature"): the sources of
// this checkout decide what is expected, and the baseline is not consulted.
//
// Expected, from the sources:
//   - the categories are the entries of src/lib/categories.ts, one per line in the form
//     `{ id: "…", name: "…", slug: "…", description: "…" },` (that file says so). No entry parsed → fail.
//   - every top-level posts/*.md that is not a draft (the rule of the tags check: a "draft:" file name, or a front
//     matter `draft` set to anything but false; posts/draft/ is never published) has a `category` that is the name
//     of one entry. Its `date` orders it: newest first, the same date by id (String#localeCompare).
//
// On the candidate (addresses compared percent-decoded, in NFC, without ".html"):
//   /categories/<slug>  one page per entry, empty categories included, and no other page below /categories/. The
//                       /posts/<id> links it shows are exactly the published posts of that category, newest first:
//                       no post missing, none from another category, no draft, no duplicate. A page with no post
//                       says <meta name="robots" content="noindex, follow"> (a thin page search engines should not
//                       list, WB-review); a page with posts has no noindex.
//   /categories         links to exactly the entry pages, each with "(<count>)" = the number of its posts, all 200.
//   /posts/<id>         each published post links to exactly one category page, its own, whose text is the name
//                       and which answers 200; <meta property="article:section"> is the name, once; the JSON-LD
//                       BlogPosting has articleSection = the name.
//   /sitemap.xml        has a <loc> for /categories and for every entry page with posts (absolute, on the origin
//                       of the canonical of "/"), and none for an entry page without posts.
// One failed item per wrong page. With --route only the selected pages are looked at (the sitemap and the
// whole-site "page missing" assertions only run without --route).
//
// No allowlist: a category page that disagrees with the front matter is a bug.
import fs from "node:fs";
import path from "node:path";

import {
  candidateRoutes,
  internalPath,
  listFiles,
  mutateFile,
  quote,
  readSiteFile,
  statusOf,
} from "../lib/html.mjs";
import { repoRoot } from "../lib/paths.mjs";

const postsDir = path.join(repoRoot, "posts");
const moduleFile = path.join(repoRoot, "src", "lib", "categories.ts");
const INDEX = "/categories";

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

const ENTRY =
  /^\s*\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*slug:\s*"([^"]+)",\s*description:\s*"([^"]*)"\s*\},?\s*$/gm;

/** [{ id, name, slug }] in the order of src/lib/categories.ts. */
const readCategories = () =>
  Array.from(fs.readFileSync(moduleFile, "utf8").matchAll(ENTRY), (m) => ({
    id: m[1],
    name: m[2].normalize("NFC"),
    slug: m[3],
  }));

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---/;
const DRAFT = /^[ \t]*(["']?)draft\1[ \t]*:([^\n#]*)/im;
const keyLine = (key) =>
  new RegExp(`^[ \\t]*(["']?)${key}\\1[ \\t]*:(.*)$`, "m");

/** A YAML scalar as written on one line: quoted or plain (a " #" starts a comment). */
function scalar(raw) {
  const text = raw.trim();
  const quoted = /^(["'])(.*)\1/.exec(text);
  return quoted ? quoted[2] : text.replace(/\s+#.*$/, "");
}

/** { published: [{ id, category, date }] newest first, drafts: [id] } from posts/ of this checkout. */
function readSources() {
  const published = [];
  const drafts = listFiles(path.join(postsDir, "draft")).map((rel) =>
    rel.replace(/\.md$/i, ""),
  );
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
    const value = (key) => {
      const line = keyLine(key).exec(block);
      return line ? scalar(line[2]) : null;
    };
    published.push({
      id,
      category: value("category")?.normalize("NFC") ?? null,
      date: value("date") ?? "",
    });
  }
  published.sort(
    (a, b) =>
      (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
      a.id.localeCompare(b.id),
  );
  return { published, drafts };
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
        : { pathname, key: keyOf(pathname), text: $(el).text().trim() };
    })
    .filter((link) => link !== null && link.key.startsWith(prefix));
}

const tail = (key, prefix) => key.slice(prefix.length);
const show = (list) => (list.length ? list.join(", ") : "(none)");

/** The JSON-LD nodes of a page, each block parsed (a block that does not parse is skipped). */
function jsonLd($) {
  return $('script[type="application/ld+json"]')
    .toArray()
    .flatMap((el) => {
      try {
        const data = JSON.parse($(el).text());
        return Array.isArray(data) ? data : [data];
      } catch {
        return [];
      }
    });
}

// ---------------------------------------------------------------------------------------------

export default {
  name: "categories",
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
            detail:
              "categories reads a directory and cannot check a deployed site",
          },
        ],
      };

    const categories = readCategories();
    const { published, drafts } = readSources();
    if (categories.length === 0)
      failed.push({
        route: "-",
        detail: `no category entry parsed from src/lib/categories.ts (one line per entry: { id, name, slug, description })`,
      });
    const byName = new Map(categories.map((c) => [c.name, c]));
    for (const post of published)
      if (!byName.has(post.category))
        failed.push({
          route: `/posts/${post.id}`,
          detail: `front matter category ${post.category === null ? "missing" : quote(post.category)}, expected one of ${show([...byName.keys()])}`,
        });
    /** slug → ids of its published posts, newest first. */
    const expected = new Map(
      categories.map((c) => [
        c.slug,
        published.filter((p) => p.category === c.name).map((p) => p.id),
      ]),
    );
    const draftSet = new Set(drafts.map((id) => id.normalize("NFC")));

    const narrowed = (ctx.args?.route ?? []).length > 0;
    const routes = candidateRoutes(ctx);
    const keyed = new Map(routes.map((route) => [keyOf(route), route]));

    // 1. every entry has a page (whole site only)
    if (!narrowed)
      for (const c of categories)
        if (!keyed.has(`${INDEX}/${c.slug}`))
          failed.push({
            route: `${INDEX}/${c.slug}`,
            detail: `no category page for ${quote(c.name)}`,
          });

    // 2. category pages: the posts they list, in order
    for (const route of routes) {
      const key = keyOf(route);
      if (!key.startsWith(`${INDEX}/`)) continue;
      const slug = tail(key, `${INDEX}/`);
      const ids = expected.get(slug);
      if (!ids) {
        result(route, [`category page for no entry of src/lib/categories.ts`]);
        continue;
      }
      const $ = await ctx.dom("candidate", route);
      const listed = linksUnder($, route, "/posts/").map((link) =>
        tail(link.key, "/posts/"),
      );
      const problems = [];
      const leaked = listed.filter((id) => draftSet.has(id));
      if (leaked.length) problems.push(`lists drafts ${show(leaked)}`);
      if (listed.join("\n") !== ids.join("\n"))
        problems.push(
          `posts ${show(listed)}, expected newest first ${show(ids)}`,
        );
      const robots = $('meta[name="robots"]')
        .toArray()
        .map((el) => $(el).attr("content") ?? "");
      const noindex = robots.some((content) => /\bnoindex\b/.test(content));
      if (ids.length === 0 && !noindex)
        problems.push(
          `no posts but robots ${show(robots)}, expected "noindex, follow"`,
        );
      if (ids.length > 0 && noindex)
        problems.push(`${ids.length} posts but robots ${show(robots)}`);
      result(route, problems);
    }

    // 3. /categories: links and counts
    if (keyed.has(INDEX)) {
      const route = keyed.get(INDEX);
      const $ = await ctx.dom("candidate", route);
      const problems = [];
      const links = linksUnder($, route, `${INDEX}/`);
      const shown = links.map((link) => tail(link.key, `${INDEX}/`));
      const want = categories.map((c) => c.slug);
      if ([...new Set(shown)].sort().join() !== [...want].sort().join())
        problems.push(`categories ${show(shown)}, expected ${show(want)}`);
      for (const link of links) {
        const ids = expected.get(tail(link.key, `${INDEX}/`));
        const count = /\((\d+)\)/.exec(link.text)?.[1];
        if (ids && Number(count) !== ids.length)
          problems.push(
            `${link.key} shows count ${count ?? "none"}, expected ${ids.length}`,
          );
        if ((await statusOf(ctx, "candidate", link.pathname)) !== 200)
          problems.push(`${link.pathname} does not answer 200`);
      }
      result(route, problems);
    } else if (!narrowed)
      failed.push({ route: INDEX, detail: "no category index page" });

    // 4. post pages: their category link, article:section and JSON-LD articleSection
    const posts = new Map(published.map((post) => [post.id, post]));
    for (const route of routes) {
      const key = keyOf(route);
      if (!key.startsWith("/posts/")) continue;
      const post = posts.get(tail(key, "/posts/"));
      if (!post) continue; // not a published source: the drafts check owns that
      const category = byName.get(post.category);
      if (!category) continue; // reported with the sources above
      const $ = await ctx.dom("candidate", route);
      const problems = [];
      const links = linksUnder($, route, `${INDEX}/`);
      const own = `${INDEX}/${category.slug}`;
      if (links.length !== 1 || links[0].key !== own)
        problems.push(
          `category links ${show(links.map((l) => l.key))}, expected ${own} once`,
        );
      for (const link of links) {
        if (link.key === own && link.text !== category.name)
          problems.push(
            `category link text ${quote(link.text)}, expected ${quote(category.name)}`,
          );
        if ((await statusOf(ctx, "candidate", link.pathname)) !== 200)
          problems.push(`${link.pathname} does not answer 200`);
      }
      const sections = $('meta[property="article:section"]')
        .toArray()
        .map((el) => $(el).attr("content"));
      if (sections.length !== 1 || sections[0] !== category.name)
        problems.push(
          `article:section ${show(sections)}, expected ${category.name}`,
        );
      const article = jsonLd($).find((node) => node["@type"] === "BlogPosting");
      if (article?.articleSection !== category.name)
        problems.push(
          `JSON-LD articleSection ${article ? quote(JSON.stringify(article.articleSection)) : "(no BlogPosting)"}, expected ${quote(category.name)}`,
        );
      result(route, problems);
    }

    // 5. sitemap.xml (whole site only)
    if (!narrowed) {
      const xml = (
        await readSiteFile(ctx, "candidate", "sitemap.xml")
      )?.toString("utf8");
      const locs = new Set(
        Array.from(xml?.matchAll(/<loc>([^<]*)<\/loc>/g) ?? [], (m) =>
          m[1].replaceAll("&amp;", "&"),
        ),
      );
      const home = await ctx.dom("candidate", "/");
      const site = home?.('link[rel="canonical"]').attr("href") ?? "";
      const at = (p) => `${site.replace(/\/+$/, "")}${p}`;
      const filled = (c) => (expected.get(c.slug) ?? []).length > 0;
      const want = [
        INDEX,
        ...categories.filter(filled).map((c) => `${INDEX}/${c.slug}`),
      ].map(at);
      const unwanted = categories
        .filter((c) => !filled(c))
        .map((c) => at(`${INDEX}/${c.slug}`));
      const missing = want.filter((loc) => !locs.has(loc));
      const extra = unwanted.filter((loc) => locs.has(loc));
      result(
        "/sitemap.xml",
        xml === undefined
          ? ["no sitemap.xml"]
          : [
              ...(missing.length ? [`missing <loc> ${show(missing)}`] : []),
              ...(extra.length
                ? [`<loc> for a category without posts ${show(extra)}`]
                : []),
            ],
      );
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: {
        categories: Object.fromEntries(expected),
        drafts,
      },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "카테고리 페이지에서 글 하나 삭제",
        apply(dir) {
          mutateFile(dir, "categories/dev.html", (html) =>
            html.replace(/<article[^>]*>[\s\S]*?<\/article>/, ""),
          );
        },
      },
      {
        name: "카테고리 페이지의 글 순서를 바꿈",
        apply(dir) {
          mutateFile(dir, "categories/dev.html", (html) =>
            html.replace(
              /(<article[^>]*>[\s\S]*?<\/article>)(<article[^>]*>[\s\S]*?<\/article>)/,
              "$2$1",
            ),
          );
        },
      },
      {
        name: "카테고리 페이지에 posts/draft/ 의 초안 추가",
        apply(dir) {
          const draft = listFiles(path.join(postsDir, "draft"))[0].replace(
            /\.md$/i,
            "",
          );
          mutateFile(dir, "categories/dev.html", (html) =>
            html.replace(
              "</section>",
              `<article><a href="/posts/${encodeURIComponent(draft)}"><h2>x</h2></a></article></section>`,
            ),
          );
        },
      },
      {
        name: "다른 카테고리의 글을 빈 카테고리 페이지에 추가",
        apply(dir) {
          const other = readSources().published[0];
          mutateFile(dir, "categories/life.html", (html) =>
            html.replace(
              "</section>",
              `<article><a href="/posts/${other.id}"><h2>x</h2></a></article></section>`,
            ),
          );
        },
      },
      {
        name: "글이 없는 카테고리 페이지 삭제",
        apply(dir) {
          fs.rmSync(path.join(dir, "categories", "life.html"));
        },
      },
      {
        name: "목록에 없는 카테고리 페이지",
        apply(dir) {
          fs.copyFileSync(
            path.join(dir, "categories", "life.html"),
            path.join(dir, "categories", "money.html"),
          );
        },
      },
      {
        name: "/categories 의 글 수 변경",
        apply(dir) {
          mutateFile(dir, "categories.html", (html) =>
            html.replace(/\((\d+)\)/, (_, n) => `(${Number(n) + 1})`),
          );
        },
      },
      {
        name: "글의 카테고리 링크를 다른 카테고리로",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week1.html", (html) =>
            html.replace('href="/categories/dev"', 'href="/categories/life"'),
          );
        },
        routes: ["/posts/css-masters-2-week1"],
      },
      {
        name: "JSON-LD articleSection 변경",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week1.html", (html) =>
            html.replace(/"articleSection":"[^"]*"/, '"articleSection":"일상"'),
          );
        },
        routes: ["/posts/css-masters-2-week1"],
      },
      {
        name: "article:section 삭제",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week1.html", (html) =>
            html.replace(/<meta property="article:section"[^>]*>/, ""),
          );
        },
        routes: ["/posts/css-masters-2-week1"],
      },
      {
        name: "sitemap 에서 카테고리 페이지 하나 삭제",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /<url><loc>([^<]*)\/categories\/dev<\/loc>[^\n]*?<\/url>/,
              "",
            ),
          );
        },
      },
      {
        name: "sitemap 에 글이 없는 카테고리 페이지 추가",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /<url><loc>([^<]*)\/categories<\/loc>/,
              "<url><loc>$1/categories/life</loc></url>\n$&",
            ),
          );
        },
      },
      {
        name: "글이 없는 카테고리 페이지의 noindex 삭제",
        apply(dir) {
          mutateFile(dir, "categories/life.html", (html) =>
            html.replace(
              /<meta name="robots" content="noindex, follow"/,
              '<meta name="robots" content="index, follow"',
            ),
          );
        },
        routes: ["/categories/life"],
      },
    ],
    accepted: [
      {
        name: "카테고리 링크를 문서 기준 상대 주소로 적음",
        apply(dir) {
          mutateFile(dir, "posts/css-masters-2-week1.html", (html) =>
            html.replace(
              'href="/categories/dev"',
              'href="../categories/dev.html"',
            ),
          );
        },
      },
    ],
  },
};
