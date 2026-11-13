// rss — the candidate's /rss.xml is an RSS 2.0 feed of the published posts, and every page points to it.
// Candidate-only (scope "feature"): the old site had no feed, and the baseline is never read.
//
// The feed (always the whole feed, whatever --route says):
//   - is well-formed XML (lib/xml.mjs), its root is <rss version="2.0"> with exactly one <channel>
//   - channel <title> = the <title> of "/", channel <link> = the canonical of "/"
//   - every <item> has one <title>, <link> and <pubDate>; <link> is the canonical of the page it points to
//     (character for character: no trailing "/", no ".html"), and that page is a post page of the candidate;
//     <guid>, when present, equals <link>; item <title> = the page's <title>;
//     <description> = the page's meta description (absent when that is empty);
//     <pubDate> is an RFC 822 date in GMT that falls on the day of the page's article:published_time
//   - no two items share a link; items are newest first (pubDate never increases)
//   - the number of items = the number of published sources: top-level posts/*.md that are not drafts
//   - no item points to a draft (posts/draft/**, a top-level "draft:" name, front matter `draft: true`) by its
//     address, nor carries a draft's title that no published page carries
// Every HTML route of the candidate (narrowed by --route):
//   - exactly one <link rel="alternate" type="application/rss+xml"> in <head>, whose href resolves to /rss.xml
//   - a post page (/posts/*) is the target of exactly one item
//
// No allowlist: a feed that leaves out a post or leaks a draft is never what was meant.
import fs from "node:fs";
import path from "node:path";

import { load } from "cheerio";

import {
  addPage,
  candidateRoutes,
  listFiles,
  mutateFile,
  NEW_PAGE,
  postFiles,
  quote,
} from "../lib/html.mjs";
import { repoRoot } from "../lib/paths.mjs";
import { inspectXml } from "../lib/xml.mjs";

const FEED = "/rss.xml";
const postsDir = path.join(repoRoot, "posts");

// RFC 822 as RSS 2.0 uses it (four-digit year), the way Date#toUTCString writes it.
const RFC_822 =
  /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

const isPostRoute = (route) => /^\/posts\/[^/]+$/.test(route);

/** Route a URL points at, decoded ("https://host/posts/a%20b" → "/posts/a b"), or null when it is no URL. */
function routeOf(url) {
  try {
    return decodeURI(new URL(url).pathname) || "/";
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Sources: which posts are published and which are drafts (the same rules as the drafts check)
// ---------------------------------------------------------------------------------------------

const FRONT_MATTER = /^﻿?(?:---|\+\+\+)([\s\S]*?\n)(?:---|\+\+\+)/;
const DRAFT_KEY = /^[ \t]*(["']?)draft\1[ \t]*[:=]([^\n#]*)/im;
const TITLE_KEY = /^[ \t]*title[ \t]*:[ \t]*(.*)$/m;

function titleOf(block) {
  const raw = TITLE_KEY.exec(block)?.[1]?.trim() ?? "";
  const quoted = /^(["'])(.*)\1$/.exec(raw);
  return (quoted ? quoted[2] : raw.replace(/\s+#.*$/, "")).trim() || null;
}

/** { published: [{ id }], drafts: [{ id, title, file }] } from posts/ of this checkout. */
function readSources() {
  const published = [];
  const drafts = [];
  for (const rel of listFiles(postsDir).filter((rel) => /\.md$/i.test(rel))) {
    const id = rel.replace(/\.md$/i, "").split("/").at(-1);
    const text = fs.readFileSync(path.join(postsDir, rel), "utf8");
    const block = FRONT_MATTER.exec(text)?.[1] ?? "";
    const flag = DRAFT_KEY.exec(block);
    const isDraft =
      /^draft\//i.test(rel) ||
      (!rel.includes("/") &&
        (/^draft:/i.test(rel) ||
          (flag !== null && !/^(["']?)false\1$/i.test(flag[2].trim()))));
    if (isDraft)
      drafts.push({ id, title: titleOf(block), file: `posts/${rel}` });
    else if (!rel.includes("/")) published.push({ id });
  }
  return { published, drafts };
}

// ---------------------------------------------------------------------------------------------

/** What the checks compare an item with: the page's head. */
async function pageFacts(ctx, route) {
  const $ = await ctx.dom("candidate", route);
  if ($ === null) return null;
  const meta = (attr, name) => $(`meta[${attr}="${name}"]`).attr("content");
  return {
    title: $("title").first().text(),
    canonical: $('link[rel="canonical"]').attr("href") ?? null,
    description: meta("name", "description") ?? "",
    published: meta("property", "article:published_time") ?? null,
  };
}

export default {
  name: "rss",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const failed = [];
    const cells = {};
    let pass = 0;
    const feedProblem = (detail) => failed.push({ route: FEED, detail });

    const xml = await ctx.html("candidate", FEED);
    if (xml === null)
      return {
        ok: false,
        pass: 0,
        fail: 1,
        failed: [{ route: FEED, detail: "missing in candidate" }],
      };

    // --- the feed as a whole -------------------------------------------------------------------
    const { problem, root } = inspectXml(xml);
    if (problem) feedProblem(`not well-formed XML: ${problem}`);
    if (root && (root.name !== "rss" || root.attributes.version !== "2.0"))
      feedProblem(
        `root is <${root.name} version=${quote(root.attributes.version)}>, not <rss version="2.0">`,
      );

    const $ = load(xml, { xmlMode: true });
    const channels = $("rss > channel");
    if (channels.length !== 1)
      feedProblem(`${channels.length} <channel> elements, not 1`);

    const home = await pageFacts(ctx, "/");
    if (home === null) feedProblem("home page missing in candidate");
    else {
      const title = channels.first().children("title").text();
      const link = channels.first().children("link").text().trim();
      if (title !== home.title)
        feedProblem(
          `channel title ${quote(title)} ≠ home <title> ${quote(home.title)}`,
        );
      if (link !== home.canonical)
        feedProblem(
          `channel link ${quote(link)} ≠ home canonical ${quote(home.canonical)}`,
        );
    }

    // --- items ---------------------------------------------------------------------------------
    const { published, drafts } = readSources();
    if (published.length === 0)
      feedProblem("no published sources under posts/: nothing to compare with");
    if (drafts.length === 0)
      feedProblem(
        "no draft sources under posts/: the draft rule asserts nothing",
      );

    const items = channels.first().children("item").toArray();
    if (items.length !== published.length)
      feedProblem(
        `${items.length} items, but posts/ has ${published.length} published sources`,
      );

    const draftIds = new Map(drafts.map((d) => [d.id.normalize("NFC"), d]));
    const draftTitles = new Map(
      drafts.filter((d) => d.title).map((d) => [d.title.normalize("NFC"), d]),
    );
    const targets = new Map(); // route → number of items that point at it
    let previous = Infinity;

    for (const [index, el] of items.entries()) {
      const item = $(el);
      const where = `item ${index + 1}`;
      const wrong = [];
      const one = (name) => {
        const found = item.children(name);
        if (found.length !== 1) wrong.push(`${found.length} <${name}>`);
        return found.length ? found.first().text() : null;
      };
      const title = one("title");
      const link = (one("link") ?? "").trim();
      const pubDate = (one("pubDate") ?? "").trim();
      const descriptions = item.children("description");
      const guid = item.children("guid");

      const route = routeOf(link);
      if (route !== null) targets.set(route, (targets.get(route) ?? 0) + 1);

      // Drafts: by address, and by a title only a draft carries.
      const draft =
        (route &&
          isPostRoute(route) &&
          draftIds.get(route.slice(7).normalize("NFC"))) ||
        null;
      if (draft)
        wrong.push(`links to the draft ${draft.file} (${quote(link)})`);

      const page =
        route && isPostRoute(route) ? await pageFacts(ctx, route) : null;
      if (page === null) {
        wrong.push(`link ${quote(link)} is not a post page of the candidate`);
        const byTitle = draftTitles.get(String(title).normalize("NFC"));
        if (byTitle && !draft)
          wrong.push(`carries the title of the draft ${byTitle.file}`);
      } else {
        if (link !== page.canonical)
          wrong.push(
            `link ${quote(link)} ≠ canonical ${quote(page.canonical)} of ${route}`,
          );
        if (title !== null && title !== page.title)
          wrong.push(`title ${quote(title)} ≠ <title> ${quote(page.title)}`);
        const description =
          descriptions.length === 1 ? descriptions.first().text() : "";
        if (descriptions.length > 1)
          wrong.push(`${descriptions.length} <description>`);
        else if (description !== page.description)
          wrong.push(
            `description ${quote(description, 40)} ≠ meta description ${quote(page.description, 40)}`,
          );
        if (pubDate && page.published?.slice(0, 10) !== isoDay(pubDate))
          wrong.push(
            `pubDate ${quote(pubDate)} is not the day of article:published_time ${quote(page.published)}`,
          );
      }
      if (guid.length > 1) wrong.push(`${guid.length} <guid>`);
      else if (guid.length === 1 && guid.text().trim() !== link)
        wrong.push(`guid ${quote(guid.text())} ≠ link`);

      if (pubDate && !RFC_822.test(pubDate))
        wrong.push(`pubDate ${quote(pubDate)} is not RFC 822 in GMT`);
      const time = Date.parse(pubDate);
      if (Number.isFinite(time)) {
        if (time > previous)
          wrong.push(`pubDate ${quote(pubDate)} is newer than the item before`);
        previous = time;
      }

      if (wrong.length === 0) pass++;
      else
        failed.push({ route: FEED, detail: `${where}: ${wrong.join("; ")}` });
    }
    for (const [route, count] of targets)
      if (count > 1) feedProblem(`${count} items link to ${route}`);

    // --- every page ------------------------------------------------------------------------------
    for (const route of candidateRoutes(ctx)) {
      const page = await ctx.dom("candidate", route);
      const wrong = [];
      const alternates = page('head link[rel="alternate"]')
        .toArray()
        .filter(
          (el) =>
            page(el).attr("type")?.toLowerCase() === "application/rss+xml",
        );
      if (alternates.length !== 1)
        wrong.push(`${alternates.length} RSS alternate links in <head>, not 1`);
      else {
        const href = page(alternates[0]).attr("href") ?? "";
        let target = null;
        try {
          const home = (await pageFacts(ctx, "/"))?.canonical ?? "";
          const url = new URL(href, new URL(route, `${home}/`));
          target = url.origin === new URL(home).origin ? url.pathname : null;
        } catch {
          // not a URL
        }
        if (target !== FEED)
          wrong.push(
            `RSS alternate link ${quote(href)} does not lead to ${FEED}`,
          );
      }
      if (isPostRoute(route) && (targets.get(route) ?? 0) !== 1)
        wrong.push(
          `post is the target of ${targets.get(route) ?? 0} feed items`,
        );

      if (wrong.length === 0) {
        pass++;
        cells[route] = "pass";
      } else {
        failed.push({ route, detail: wrong.join("; ") });
        cells[route] = "fail";
      }
    }

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: {
        items: items.length,
        published: published.length,
        drafts: drafts.length,
      },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "피드에서 가장 최근 글 삭제",
        apply(dir) {
          mutateFile(dir, "rss.xml", (xml) =>
            xml.replace(/<item>.*?<\/item>/s, ""),
          );
        },
      },
      {
        name: "item link 끝에 슬래시",
        apply(dir) {
          mutateFile(dir, "rss.xml", (xml) =>
            xml.replace(/(<item>.*?<link>[^<]*)(<\/link>)/s, "$1/$2"),
          );
        },
      },
      {
        // Item count stays the same: the newest item now points at a draft, so only the draft rule can catch it.
        name: "가장 최근 item 의 주소를 초안으로",
        apply(dir) {
          const draft = readSources().drafts.find((d) =>
            d.file.startsWith("posts/draft/"),
          );
          mutateFile(dir, "rss.xml", (xml) =>
            xml.replace(/<item>.*?<\/item>/s, (item) => {
              const link = /<link>([^<]*)<\/link>/.exec(item)[1];
              const target = link.replace(
                /\/posts\/[^/]*$/,
                `/posts/${encodeURI(draft.id)}`,
              );
              return item.replaceAll(link, target);
            }),
          );
        },
      },
      {
        name: "item 순서 뒤집기(오래된 글 먼저)",
        apply(dir) {
          mutateFile(dir, "rss.xml", (xml) =>
            xml.replace(/(<item>.*?<\/item>)(<item>.*?<\/item>)/s, "$2$1"),
          );
        },
      },
      {
        name: "XML 을 깨뜨린다(맨 &)",
        apply(dir) {
          mutateFile(dir, "rss.xml", (xml) =>
            xml.replace(/<title>/, "<title>A & B "),
          );
        },
      },
      {
        name: "item description 을 meta description 과 다르게",
        apply(dir) {
          mutateFile(dir, "rss.xml", (xml) =>
            xml.replace(
              /<description>[^<]*<\/description><pubDate>/,
              "<description>x</description><pubDate>",
            ),
          );
        },
      },
      {
        name: "홈에서 RSS alternate 링크 삭제",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(
              /<link rel="alternate" type="application\/rss\+xml"[^>]*>/,
              "",
            ),
          );
        },
        routes: ["/"],
      },
      {
        // A post page the feed does not list: what a new post would be without a feed entry.
        name: "피드에 없는, 기준선에 없는 새 글 페이지",
        apply(dir) {
          addPage(dir, postFiles(dir)[0]);
        },
        routes: [NEW_PAGE.route],
      },
    ],
  },
};

/** "Sun, 25 Jun 2023 00:00:00 GMT" → "2023-06-25"; null when it is no date. */
function isoDay(rfc822) {
  const time = Date.parse(rfc822);
  return Number.isFinite(time)
    ? new Date(time).toISOString().slice(0, 10)
    : null;
}
