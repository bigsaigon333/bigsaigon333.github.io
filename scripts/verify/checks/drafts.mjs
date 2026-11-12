// drafts — a draft never reaches the built site. Candidate-only (scope "feature"): the sources under posts/ of this
// checkout decide what a draft is, and the baseline is not consulted.
//
// A source is a draft when it
//   - lies under posts/draft/, or
//   - is a top-level posts/*.md whose file name starts with "draft:", or
//   - is a top-level posts/*.md whose front matter has a `draft` key set to anything but false.
// Every other top-level posts/*.md is published.
//
// For each draft the candidate must not have
//   page         a file at /posts/<id> (id = file name without .md), or any page whose <title> is the draft's title
//   home link    a reference on the home page to /posts/<id>
//   home title   the draft's title in the text of the home page
//   sitemap loc  a <loc> of /sitemap.xml that points to /posts/<id>
// Addresses are compared percent-decoded, in NFC and lower case, without ".html", "/index.html" and a trailing "/".
// What a published post explains is not a leak: its own address, and a title it carries too (those are counted).
// One failed item per leaked draft, naming every place it shows up.
//
// "Absent" has to mean something, so these fail as well:
//   - there are no draft sources, no published sources, no home page or no sitemap.xml to look at;
//   - one of the ways of looking finds none of the published posts either (it would not find a draft);
//   - the classifier gets one of its own EXAMPLES wrong (the repository keeps no top-level draft to try it on).
//
// No allowlist: there is no accepted way for a draft to be published.
import fs from "node:fs";
import path from "node:path";

import { load } from "cheerio";

import {
  collapse,
  listFiles,
  mutateFile,
  quote,
  rawText,
  textOf,
} from "../lib/html.mjs";
import { repoRoot } from "../lib/paths.mjs";

const postsDir = path.join(repoRoot, "posts");

const normalize = (text) => collapse(text).normalize("NFC");
const occurrences = (text, part) => (part ? text.split(part).length - 1 : 0);

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

// The block Astro takes as front matter (@astrojs/internal-helpers/frontmatter): --- (YAML) or +++ (TOML) at the top.
const FRONT_MATTER =
  /(?:^\uFEFF?|^\s*\n)(?:---|\+\+\+)([\s\S]*?\n)(?:---|\+\+\+)/;
// A `draft` entry and its value: at the start of a line in block style (YAML, TOML), after "{" or "," in flow style.
const DRAFT_BLOCK = /^[ \t]*(["']?)draft\1[ \t]*[:=]([^\n#]*)/im;
const DRAFT_FLOW = /[{,]\s*(["']?)draft\1\s*:([^,}]*)/i;
// A `title` entry in block style.
const TITLE_KEY = /^[ \t]*(["']?)title\1[ \t]*[:=](.*)$/m;

const frontMatter = (text) => FRONT_MATTER.exec(text)?.[1] ?? "";

/** True when the front matter has a `draft` key that is not false. An empty or odd value counts as a draft. */
function flaggedDraft(block) {
  const flow = block.trimStart().startsWith("{");
  const entry = (flow ? DRAFT_FLOW : DRAFT_BLOCK).exec(block);
  return entry !== null && !/^(["']?)false\1$/i.test(entry[2].trim());
}

/** The title as a reader would see it, or null when there is none or it is written in a way this does not read. */
function titleOf(block) {
  const entry = TITLE_KEY.exec(block);
  if (entry === null) return null;
  const raw = entry[2].trim();

  let value;
  const double = /^"((?:[^"\\]|\\.)*)"/.exec(raw);
  const single = /^'((?:[^']|'')*)'/.exec(raw);
  if (double) {
    try {
      value = JSON.parse(`"${double[1]}"`);
    } catch {
      value = double[1];
    }
  } else if (single) value = single[1].replaceAll("''", "'");
  else if (/^[|>]/.test(raw))
    return null; // block scalar: the text is on the following lines
  else value = raw.replace(/\s+#.*$/, ""); // plain scalar: " #" starts a comment

  return normalize(value) || null;
}

/** { kind: "draft" | "published" | "ignored", why } of a Markdown file, given its path relative to posts/ and its text. */
function classify(rel, text) {
  if (/^draft\//i.test(rel))
    return { kind: "draft", why: "under posts/draft/" };
  if (rel.includes("/"))
    return { kind: "ignored", why: "in a folder the site does not load" };
  if (/^draft:/i.test(rel))
    return { kind: "draft", why: 'file name starts with "draft:"' };
  if (flaggedDraft(frontMatter(text)))
    return { kind: "draft", why: "front matter sets draft" };
  return { kind: "published", why: "" };
}

// [path relative to posts/, text, expected kind, expected title]
const EXAMPLES = [
  ["draft/a.md", "---\ntitle: a\n---\n", "draft", "a"],
  ["draft/b/a.md", "no front matter", "draft", null],
  ["draft:a.md", "---\ntitle: a\n---\n", "draft", "a"],
  ["Draft:a.md", "", "draft", null],
  ["a.md", "---\ntitle: a\ndraft: true\n---\n", "draft", "a"],
  ["a.md", "---\r\ndraft: True # 아직\r\ntitle: a\r\n---\r\n", "draft", "a"],
  ["a.md", "\n---\ntitle: a\ndraft:\n---\n", "draft", "a"],
  ["a.md", '+++\ntitle = "a"\ndraft = true\n+++\n', "draft", "a"],
  ["a.md", '---\n{ "title": "a", "draft": true }\n---\n', "draft", null],
  ["a.md", "---\n  title: a\n  draft: yes\n---\n", "draft", "a"],
  ["a.md", "---\ntitle: a\ndraft: false\n---\n", "published", "a"],
  ["a.md", '---\ntitle: a\ndraft: "False" # 발행\n---\n', "published", "a"],
  ["a.md", "---\ntitle: a\n---\n\ndraft: true\n", "published", "a"],
  ["a.md", "---\ntitle: a\ndrafted: true\n---\n", "published", "a"],
  ["a.md", "---\ntitle: a\nkeywords: b, draft: c\n---\n", "published", "a"],
  ["a-draft:b.md", '---\ntitle: "a: \\"b\\""\n---\n', "published", 'a: "b"'],
  ["a.md", "---\ntitle: 'it''s  a' # c\n---\n", "published", "it's a"],
  ["a.md", "---\ntitle: a b # c\n---\n", "published", "a b"],
  ["a.md", "---\ntitle: >-\n  a\n---\n", "published", null],
  ["notes/a.md", "---\ndraft: true\n---\n", "ignored", null],
];

/** One line per example the classifier gets wrong. */
function wrongExamples() {
  const wrong = [];
  for (const [rel, text, kind, title] of EXAMPLES) {
    const got = classify(rel, text).kind;
    const gotTitle = titleOf(frontMatter(text));
    if (got !== kind)
      wrong.push(`${quote(rel)} with ${quote(text)} is ${got}, not ${kind}`);
    if (gotTitle !== title)
      wrong.push(
        `title of ${quote(text)} is ${quote(gotTitle)}, not ${quote(title)}`,
      );
  }
  return wrong;
}

/** Every Markdown file below posts/, sorted by path: { drafts, published, ignored }. */
function readSources() {
  const sources = { drafts: [], published: [], ignored: [] };
  for (const rel of listFiles(postsDir).filter((rel) => /\.md$/i.test(rel))) {
    const text = fs.readFileSync(path.join(postsDir, rel), "utf8");
    const { kind, why } = classify(rel, text);
    const id = rel.replace(/\.md$/i, "");
    const source = {
      file: `posts/${rel}`,
      why,
      // The id the site gives it (file name without .md) and, should folders ever be loaded, its path below posts/.
      ids: [...new Set([id.split("/").at(-1), id])],
      title: titleOf(frontMatter(text)),
    };
    if (kind === "draft") sources.drafts.push(source);
    else if (kind === "published") sources.published.push(source);
    else sources.ignored.push(source.file);
  }
  return sources;
}

// ---------------------------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------------------------

/** Comparable form of a site path. */
function keyOf(pathname) {
  let text = pathname;
  try {
    text = decodeURIComponent(pathname);
  } catch {
    // not percent-encoded after all
  }
  return (
    text
      .normalize("NFC")
      .toLowerCase()
      .replace(/(?:\/index)?\.html$/, "")
      .replace(/\/+$/, "") || "/"
  );
}

/** Path of a reference or URL, whatever its origin; null when it cannot be read as one. */
function pathOf(reference) {
  try {
    return new URL(String(reference).trim(), "http://site.invalid/").pathname;
  } catch {
    return null;
  }
}

/** Map of comparable path → the reference as written. */
function byKey(references) {
  const map = new Map();
  for (const reference of references) {
    const pathname = pathOf(reference);
    if (pathname !== null && !map.has(keyOf(pathname)))
      map.set(keyOf(pathname), reference);
  }
  return map;
}

/** What the candidate shows: its pages by address and by <title>, the links and text of its home page, its sitemap. */
async function readSite(ctx) {
  const pages = new Map();
  const titled = new Map();
  for (const rel of listFiles(ctx.candidateDir)) {
    if (!rel.endsWith(".html")) continue;
    pages.set(keyOf(`/${rel}`), rel);
    const $ = load(fs.readFileSync(path.join(ctx.candidateDir, rel), "utf8"));
    const title = normalize($("title").first().text());
    if (title) titled.set(title, [...(titled.get(title) ?? []), rel]);
  }

  const home = await ctx.dom("candidate", "/");
  const sitemap = await ctx.html("candidate", "/sitemap.xml");

  return {
    pages,
    titled,
    hasHome: home !== null,
    links: byKey(
      home === null
        ? []
        : home("[href]")
            .toArray()
            .map((el) => home(el).attr("href")),
    ),
    homeText: home === null ? "" : normalize(textOf(home("body")[0])),
    hasSitemap: sitemap !== null,
    locs: byKey(
      sitemap === null
        ? []
        : load(sitemap, { xmlMode: true })("loc")
            .toArray()
            .map((el) => rawText(el)),
    ),
  };
}

const addressOf = (id) => keyOf(`/posts/${id}`);

/** Where a source shows up in the candidate, per way of looking. Addresses in `taken` belong to someone else. */
function sightings(source, site, taken = new Set()) {
  const keys = source.ids.map(addressOf).filter((key) => !taken.has(key));
  const at = (map) => [
    ...new Set(keys.filter((key) => map.has(key)).map((key) => map.get(key))),
  ];
  return {
    page: at(site.pages),
    "page title": source.title ? (site.titled.get(source.title) ?? []) : [],
    "home link": at(site.links),
    "home title": occurrences(site.homeText, source.title),
    "sitemap loc": at(site.locs),
  };
}

const WAYS = ["page", "page title", "home link", "home title", "sitemap loc"];
const isSeen = (value) => (Array.isArray(value) ? value.length > 0 : value > 0);

// ---------------------------------------------------------------------------------------------
// Self-test helpers
// ---------------------------------------------------------------------------------------------

const escapeHtml = (text) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** A draft under posts/draft/ whose title nothing else carries, so that each mutation plants exactly one thing. */
function sampleDraft() {
  const { drafts, published } = readSources();
  const others = (draft) =>
    [...drafts, ...published].filter((source) => source !== draft);
  const sample = drafts.find(
    (draft) =>
      draft.file.startsWith("posts/draft/") &&
      draft.title &&
      !others(draft).some((source) => source.title?.includes(draft.title)),
  );
  if (!sample)
    throw new Error("no draft under posts/draft/ with a title of its own");
  return { id: sample.ids[0], title: sample.title };
}

const page = (title) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body></body></html>\n`;

const addToHomeList = (dir, entry) =>
  mutateFile(dir, "index.html", (html) =>
    html.replace("</section>", `${entry}</section>`),
  );

// ---------------------------------------------------------------------------------------------

export default {
  name: "drafts",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const problem = (detail) => failed.push({ route: "-", detail });

    // A deployed site cannot be listed, and this must never quietly look at dist/ instead.
    if (ctx.candidateUrl) {
      problem("drafts reads a directory and cannot check a deployed site");
      return { ok: false, pass: 0, fail: 1, failed };
    }

    for (const wrong of wrongExamples()) problem(`classifier: ${wrong}`);

    const { drafts, published, ignored } = readSources();
    if (drafts.length === 0)
      problem("no draft sources under posts/: there is nothing to assert");
    if (published.length === 0)
      problem(
        "no published sources under posts/: nothing to try the ways of looking on",
      );

    const site = await readSite(ctx);
    if (!site.hasHome) problem("home page missing in candidate");
    if (!site.hasSitemap) problem("sitemap.xml missing in candidate");

    // Positive control: each way of looking has to find at least one published post.
    const control = Object.fromEntries(WAYS.map((way) => [way, 0]));
    for (const source of published) {
      const seen = sightings(source, site);
      for (const way of WAYS) if (isSeen(seen[way])) control[way]++;
    }
    for (const way of WAYS) {
      if (published.length > 0 && control[way] === 0)
        problem(
          `"${way}" finds none of the ${published.length} published posts, so a draft it does not find proves nothing`,
        );
    }

    // The drafts themselves. What published posts explain is not a leak: their own address (posts/draft/a.md next to
    // posts/a.md), a page of their own with the same title, and the draft's title inside theirs on the home page.
    const taken = new Set(published.map((source) => addressOf(source.ids[0])));
    let pass = 0;
    for (const draft of drafts) {
      const seen = sightings(draft, site, taken);
      const sameTitle = published.filter(
        (source) => source.title === draft.title,
      ).length;
      const within = published.reduce(
        (sum, source) => sum + occurrences(source.title ?? "", draft.title),
        0,
      );

      const pages = new Set(seen.page);
      if (seen["page title"].length > sameTitle)
        for (const rel of seen["page title"]) pages.add(rel);

      const found = [];
      if (pages.size) found.push(`page ${[...pages].join(", ")}`);
      if (seen["home link"].length)
        found.push(`home link ${seen["home link"].join(", ")}`);
      if (seen["home title"] > within)
        found.push(`home title ${quote(draft.title)}`);
      if (seen["sitemap loc"].length)
        found.push(`sitemap loc ${seen["sitemap loc"].join(", ")}`);

      if (found.length === 0) pass++;
      else
        failed.push({
          route: `/posts/${draft.ids[0]}`,
          detail: `draft is published: ${found.join("; ")} (source ${draft.file}, ${draft.why})`,
        });
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      extra: {
        drafts: drafts.map(({ file, why, title }) => ({ file, why, title })),
        published: published.length,
        ignored,
        control,
      },
    };
  },

  selftest: {
    mutations: [
      {
        name: "posts/draft/ 의 글에 페이지 추가",
        apply(dir) {
          const { id } = sampleDraft();
          fs.writeFileSync(path.join(dir, "posts", `${id}.html`), page("x"));
        },
      },
      {
        name: "초안 제목의 페이지를 다른 주소에 추가",
        apply(dir) {
          const { title } = sampleDraft();
          fs.mkdirSync(path.join(dir, "preview"), { recursive: true });
          fs.writeFileSync(path.join(dir, "preview", "x.html"), page(title));
        },
      },
      {
        name: "sitemap 에 초안 주소 추가(퍼센트 인코딩)",
        apply(dir) {
          const { id } = sampleDraft();
          mutateFile(dir, "sitemap.xml", (xml) => {
            const origin = /<loc>(https?:\/\/[^/<]+)/.exec(xml)?.[1];
            return origin
              ? xml.replace(
                  "</urlset>",
                  `<url><loc>${origin}/posts/${encodeURIComponent(id)}</loc></url>\n</urlset>`,
                )
              : xml;
          });
        },
      },
      {
        name: "홈 목록에 초안 제목 추가(링크 없이)",
        apply(dir) {
          const { title } = sampleDraft();
          addToHomeList(
            dir,
            `<article><h2>${escapeHtml(title)}</h2></article>`,
          );
        },
      },
      {
        name: "홈 목록에 초안 링크 추가(제목 없이)",
        apply(dir) {
          const { id } = sampleDraft();
          addToHomeList(
            dir,
            `<article><a href="/posts/${id}.html"><h2>x</h2></a></article>`,
          );
        },
      },
    ],
  },
};
