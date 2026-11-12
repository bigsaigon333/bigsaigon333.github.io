// seo — what search engines and link previews read, beyond the tags the old site had.
//
// A feature check: every rule is asserted on the candidate alone and the baseline is never read (it cannot pass).
// Where possible a rule compares two things on the same page instead of a constant, so the tags cannot drift apart.
//
// Every HTML route of the candidate (a new post included), narrowed by --route:
//   - exactly one <title>, one canonical link, one meta description; no meta name/property twice (article:tag may repeat)
//   - robots is ROBOTS_NOINDEX on /404 and ROBOTS_INDEX everywhere else
//   - og:title, twitter:title = <title>; og:description, twitter:description = description; og:url = canonical
//   - og:site_name = the <title> of "/"; og:locale looks like "ko_KR"
//   - og:image:width / :height / :type = what the header of the image file og:image points to says;
//     og:image:alt and twitter:image:alt are not empty; og:image:* come after og:image (Open Graph reads them in order)
//   - exactly one <link rel="sitemap"> and its target is served
//   - every JSON-LD block parses and contains no raw "<"
// /posts/*:
//   - article:published_time is ISO 8601 and = the datetime of the page's <time> (the one outside <main>)
//   - article:tag list = meta keywords list
//   - exactly one JSON-LD block, a BlogPosting: headline = <title>, datePublished = article:published_time,
//     url and mainEntityOfPage = canonical, image = og:image, author.name = meta author, inLanguage = html[lang],
//     description = meta description and keywords = meta keywords (each key absent when the page has none)
// "/":    exactly one JSON-LD block, a WebSite: url = canonical, name = <title>
// "/404": no JSON-LD
// Routes that are not posts carry no article:* tags.
//
// One failed item per route lists every violated rule. Allowlist item: "route:<route>".
import {
  addPage,
  allowances,
  candidateRoutes,
  internalPath,
  mutateFile,
  NEW_PAGE,
  postFiles,
  probe,
  quote,
  rawText,
  statusOf,
} from "../lib/html.mjs";

const ROBOTS_INDEX =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";
const ROBOTS_NOINDEX = "noindex, follow";
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const isPost = (route) => route.startsWith("/posts/");

const list = (content) =>
  String(content ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
const sameList = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);
const show = (values) =>
  `[${values.map((value) => quote(value, 30)).join(", ")}]`;

/** { type, width, height } from the header of a PNG, GIF or JPEG file; null for anything else. */
function imageInfo(bytes) {
  if (
    bytes.length >= 24 &&
    bytes.readUInt32BE(0) === 0x89504e47 &&
    bytes.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return {
      type: "image/png",
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  if (
    bytes.length >= 10 &&
    /^GIF8[79]a$/.test(bytes.toString("latin1", 0, 6))
  ) {
    return {
      type: "image/gif",
      width: bytes.readUInt16LE(6),
      height: bytes.readUInt16LE(8),
    };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // JPEG: walk the segments to the first start-of-frame. The size is not at a fixed offset, and an Exif
    // thumbnail (a whole JPEG inside APP1) is skipped because its segment is jumped over by length.
    let at = 2;
    while (at + 9 <= bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1];
      if (marker === 0xff)
        at += 1; // fill byte
      else if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9))
        at += 2; // no payload
      else if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 && // DHT
        marker !== 0xc8 && // JPG
        marker !== 0xcc // DAC
      ) {
        return {
          type: "image/jpeg",
          height: bytes.readUInt16BE(at + 5),
          width: bytes.readUInt16BE(at + 7),
        };
      } else at += 2 + bytes.readUInt16BE(at + 2);
    }
  }
  return null;
}

/** The URL a JSON-LD value stands for: "…", { "@id": "…" } or { url: "…" }. */
const urlOf = (value) =>
  typeof value === "string" ? value : (value?.["@id"] ?? value?.url ?? null);

const hasType = (node, type) => [node?.["@type"]].flat().includes(type);

/** Every violated rule of one page, each as a short phrase. */
async function violations(ctx, route, $, siteName) {
  const problems = [];
  const expect = (label, actual, expected) => {
    if (actual !== expected)
      problems.push(
        `${label}: ${quote(actual, 60)}, expected ${quote(expected, 60)}`,
      );
  };

  const attrs = (selector, attr) =>
    $(selector)
      .toArray()
      .map((el) => $(el).attr(attr) ?? "");
  /** The value of something a page must have exactly once; otherwise a violation and null. */
  const only = (label, values) => {
    if (values.length === 1) return values[0];
    problems.push(`${label}: found ${values.length}, expected exactly 1`);
    return null;
  };
  /** content of a meta tag, null (and a violation) when absent. Repeats are reported once, by the scan below. */
  const meta = (key) => {
    const attr = /^(og|article):/.test(key) ? "property" : "name";
    const values = attrs(`meta[${attr}="${key}"]`, "content");
    if (values.length === 0) problems.push(`${key}: missing`);
    return values[0] ?? null;
  };

  // ---- the page itself -------------------------------------------------------------------------
  const title = only(
    "<title>",
    $("head title")
      .toArray()
      .map((el) => rawText(el)),
  );
  const canonical = only("canonical", attrs('link[rel~="canonical"]', "href"));
  const description = meta("description");

  const counts = new Map();
  for (const el of $("meta[name], meta[property]").toArray()) {
    const key = $(el).attr("property") ?? $(el).attr("name");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts]
    .filter(([key, count]) => count > 1 && key !== "article:tag")
    .map(([key, count]) => `${key} ×${count}`);
  if (repeated.length) problems.push(`repeated meta: ${repeated.join(", ")}`);

  const robots = meta("robots");
  if (robots !== null)
    expect("robots", robots, route === "/404" ? ROBOTS_NOINDEX : ROBOTS_INDEX);

  // ---- link previews ---------------------------------------------------------------------------
  for (const [key, expected] of [
    ["og:title", title],
    ["twitter:title", title],
    ["og:description", description],
    ["twitter:description", description],
    ["og:url", canonical],
  ]) {
    const actual = meta(key);
    if (actual !== null && expected !== null) expect(key, actual, expected);
  }

  const ogSiteName = meta("og:site_name");
  if (ogSiteName !== null) {
    if (ogSiteName === "") problems.push("og:site_name: empty");
    else if (siteName !== null) expect("og:site_name", ogSiteName, siteName);
  }
  const locale = meta("og:locale");
  if (locale !== null && !/^[a-z]{2,3}_[A-Z]{2}$/.test(locale))
    problems.push(`og:locale: ${quote(locale)} is not language_TERRITORY`);

  const ogImage = meta("og:image");
  const width = meta("og:image:width");
  const height = meta("og:image:height");
  const type = meta("og:image:type");
  for (const key of ["og:image:alt", "twitter:image:alt"])
    if (meta(key) === "") problems.push(`${key}: empty`);

  const order = attrs("meta[property]", "property");
  const early = order
    .slice(0, Math.max(order.indexOf("og:image"), 0))
    .filter((key) => key.startsWith("og:image:"));
  if (early.length) problems.push(`before og:image: ${early.join(", ")}`);

  if (ogImage !== null) {
    // The image is addressed by absolute URL. It is ours when it is on the origin the canonical names.
    let pathname = null;
    try {
      const url = new URL(ogImage);
      if (canonical !== null && url.origin === new URL(canonical).origin)
        pathname = url.pathname;
    } catch {
      // not an absolute URL: stays null
    }
    const file =
      pathname === null ? null : await probe(ctx, "candidate", pathname);
    const info = file?.status === 200 ? imageInfo(file.body) : null;
    if (pathname === null)
      problems.push(
        `og:image: ${quote(ogImage, 60)} is not on the canonical origin, size unverified`,
      );
    else if (file.status !== 200)
      problems.push(`og:image: ${pathname} → ${file.status}`);
    else if (info === null)
      problems.push(`og:image: ${pathname} is not a PNG, GIF or JPEG`);
    else {
      for (const [key, value, real] of [
        ["og:image:width", width, info.width],
        ["og:image:height", height, info.height],
      ]) {
        if (value === null) continue;
        if (!/^[1-9]\d*$/.test(value))
          problems.push(`${key}: ${quote(value)} is not an integer`);
        else if (Number(value) !== real)
          problems.push(
            `${key}: ${value}, but ${pathname} is ${info.width}x${info.height}`,
          );
      }
      if (type !== null && type !== info.type)
        problems.push(
          `og:image:type: ${quote(type)}, but ${pathname} is ${info.type}`,
        );
    }
  }

  // ---- discovery -------------------------------------------------------------------------------
  const sitemap = only("sitemap link", attrs('link[rel~="sitemap"]', "href"));
  if (sitemap !== null) {
    const pathname = internalPath(sitemap, route);
    const status =
      pathname === null ? null : await statusOf(ctx, "candidate", pathname);
    if (status !== 200)
      problems.push(
        `sitemap link: ${quote(sitemap)} → ${status ?? "another site"}`,
      );
  }

  // ---- article tags ----------------------------------------------------------------------------
  const keywords = list(attrs('meta[name="keywords"]', "content")[0]);
  let published = null;
  if (isPost(route)) {
    published = meta("article:published_time");
    // The post header's date. A <time> inside <main> is something the post body wrote.
    const shown = only(
      "<time datetime> outside <main>",
      $("time[datetime]")
        .toArray()
        .filter((el) => $(el).closest("main").length === 0)
        .map((el) => $(el).attr("datetime")),
    );
    if (published !== null) {
      if (!ISO_8601.test(published) || Number.isNaN(Date.parse(published)))
        problems.push(
          `article:published_time: ${quote(published)} is not ISO 8601`,
        );
      if (shown !== null) expect("article:published_time", published, shown);
    }
    const tags = attrs('meta[property="article:tag"]', "content");
    if (!sameList(tags, keywords))
      problems.push(
        `article:tag: ${show(tags)}, expected the keywords ${show(keywords)}`,
      );
  } else {
    const stray = [...counts.keys()].filter((key) =>
      key.startsWith("article:"),
    );
    if (stray.length)
      problems.push(`not an article, but has ${stray.join(", ")}`);
  }

  // ---- structured data -------------------------------------------------------------------------
  const blocks = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => rawText(el));
  const nodes = [];
  for (const [index, text] of blocks.entries()) {
    if (text.includes("<"))
      problems.push(`JSON-LD #${index + 1}: raw "<" in the script`);
    try {
      nodes.push(JSON.parse(text));
    } catch (error) {
      problems.push(`JSON-LD #${index + 1} does not parse: ${error.message}`);
    }
  }

  const wanted = isPost(route)
    ? "BlogPosting"
    : route === "/"
      ? "WebSite"
      : null;
  if (route === "/404" && blocks.length)
    problems.push(`JSON-LD: found ${blocks.length}, expected none`);
  if (wanted !== null && blocks.length !== 1)
    problems.push(`JSON-LD: found ${blocks.length}, expected exactly 1`);

  // Only a single block that parsed into a node of the wanted type is compared field by field.
  const [node] = nodes;
  const single = wanted !== null && blocks.length === 1 && nodes.length === 1;
  const typed =
    node !== null && typeof node === "object" && hasType(node, wanted);
  if (single && !typed) {
    problems.push(
      `JSON-LD @type: ${quote(node?.["@type"])}, expected ${wanted}`,
    );
  } else if (single) {
    // A rule whose other side is missing was reported above already, so it is skipped here.
    const field = (key, actual, expected) => {
      if (expected !== null) expect(`JSON-LD ${key}`, actual, expected);
    };
    field("url", urlOf(node.url), canonical);

    if (wanted === "WebSite") field("name", node.name, title);
    else {
      field("headline", node.headline, title);
      field("datePublished", node.datePublished, published);
      field("mainEntityOfPage", urlOf(node.mainEntityOfPage), canonical);
      field("image", urlOf(node.image), ogImage);
      field("author.name", node.author?.name, meta("author"));
      field("inLanguage", node.inLanguage, $("html").attr("lang") ?? null);

      if (description === "") {
        if ("description" in node)
          problems.push("JSON-LD description: present, but the page has none");
      } else field("description", node.description, description);

      const tagged =
        typeof node.keywords === "string" ? list(node.keywords) : node.keywords;
      if (keywords.length === 0) {
        if ("keywords" in node)
          problems.push("JSON-LD keywords: present, but the page has none");
      } else if (!Array.isArray(tagged) || !sameList(tagged, keywords))
        problems.push(
          `JSON-LD keywords: ${quote(JSON.stringify(node.keywords), 60)}, expected ${show(keywords)}`,
        );
    }
  }

  return problems;
}

/** Self-test: change the content of the first `<meta property="…">` named `property` in `html`. */
const setProperty = (html, property, change) =>
  html.replace(
    new RegExp(`(<meta property="${property}" content=")([^"]*)`),
    (_, before, value) => before + change(value),
  );

export default {
  name: "seo",
  kind: "static",
  scope: "feature",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "seo");
    const failed = [];
    const cells = {};
    const found = {};
    let pass = 0;

    const home = await ctx.dom("candidate", "/");
    const siteName = home === null ? null : rawText(home("head title")[0]);

    // The candidate's routes, not the baseline's: a post a pull request adds is a page the baseline has never had.
    for (const route of candidateRoutes(ctx)) {
      const $ = await ctx.dom("candidate", route);
      const problems =
        $ === null
          ? ["route missing in candidate"]
          : await violations(ctx, route, $, siteName);

      if (problems.length === 0) {
        pass++;
        cells[route] = "pass";
        continue;
      }
      found[route] = problems;
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
      extra: { allowed, violations: found },
    };
  },

  selftest: {
    // Applied to a copy of dist/ (scope "feature").
    mutations: [
      {
        name: "og:locale 삭제",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(/<meta property="og:locale"[^>]*>/, ""),
          );
        },
      },
      {
        name: "글 하나의 article:published_time 변경",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            setProperty(
              html,
              "article:published_time",
              () => "1999-12-31T00:00:00.000Z",
            ),
          );
        },
      },
      {
        name: "JSON-LD 를 깨뜨린다",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(/(<script type="application\/ld\+json">)\{/, "$1{,"),
          );
        },
      },
      {
        name: "canonical 링크 중복",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(/<link rel="canonical"[^>]*>/, "$&$&"),
          );
        },
      },
      {
        name: "og:image:width 를 실제와 다르게",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            setProperty(html, "og:image:width", (value) =>
              String(Number(value) + 1),
            ),
          );
        },
      },
      {
        // A post the baseline does not have, as a pull request would add one: its head has to be checked too.
        name: "기준선에 없는 새 글 페이지의 canonical 삭제",
        apply(dir) {
          addPage(dir, postFiles(dir)[0], (html) =>
            html.replace(/<link rel="canonical"[^>]*>/, ""),
          );
        },
        routes: [NEW_PAGE.route],
      },
      {
        name: "404 의 noindex 삭제",
        apply(dir) {
          mutateFile(dir, "404.html", (html) =>
            html.replace(
              /(<meta name="robots" content=")[^"]*/,
              `$1${ROBOTS_INDEX}`,
            ),
          );
        },
      },
    ],
  },
};
