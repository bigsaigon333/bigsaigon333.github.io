// head — per route, what crawlers, link previews and utterances read from <head>.
//
// Compared exactly: html[lang], <title> (utterances finds the comment thread by it), meta description / author /
// viewport / google-site-verification, canonical, og:*, twitter:*, icon, presence of a utf-8 charset meta.
// meta keywords is compared as a list (split on ",", trimmed, empties dropped).
//
// A fixed list of baseline fields cannot see a tag only the candidate has, so three kinds of tag that take a
// page out of search results or send its visitors elsewhere are compared too, anywhere in the document:
//   - the noindex / nofollow / none directives of a robots meta (robots, googlebot, any "…bot" crawler name).
//     Only those: <meta name="robots" content="index, follow, max-image-preview:large"> restricts nothing.
//   - <meta http-equiv="refresh">
//   - <base>
//
// One failed item per route lists every differing field as "field: baseline → candidate".
//
// Allowlist item: "route:<route>" exempts the route from the comparison with its baseline page, not from having
// a head: its <title> must not be empty, and lang, charset, viewport, favicon and google-site-verification must
// be what the baseline's home page has, with no refresh and no <base>. A route the candidate does not have is
// never exempt.
import {
  allowances,
  mutateFile,
  postFiles,
  quote,
  rawText,
} from "../lib/html.mjs";

const NAMED = ["description", "author", "viewport", "google-site-verification"];
const OPEN_GRAPH = [
  "og:title",
  "og:description",
  "og:url",
  "og:type",
  "og:image",
];
const TWITTER = [
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:image",
];

const keywordList = (content) =>
  String(content ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/** Field name → list of values. A list so that a missing tag ([]) and a duplicated tag (2 values) both show up. */
function headFields($) {
  const head = $("head");
  const attrs = (selector, attr) =>
    head
      .find(selector)
      .toArray()
      .map((el) => $(el).attr(attr) ?? "");

  const fields = new Map();
  fields.set(
    "lang",
    [$("html").attr("lang")].filter((value) => value !== undefined),
  );
  fields.set(
    "charset",
    attrs("meta[charset]", "charset").map((value) =>
      value.trim().toLowerCase(),
    ),
  );
  fields.set(
    "title",
    head
      .find("title")
      .toArray()
      .map((el) => rawText(el)),
  );
  for (const name of NAMED)
    fields.set(name, attrs(`meta[name="${name}"]`, "content"));
  fields.set(
    "keywords",
    attrs('meta[name="keywords"]', "content").map((content) =>
      keywordList(content).join(", "),
    ),
  );
  fields.set("canonical", attrs('link[rel~="canonical"]', "href"));
  for (const property of OPEN_GRAPH)
    fields.set(property, attrs(`meta[property="${property}"]`, "content"));
  for (const name of TWITTER)
    fields.set(name, attrs(`meta[name="${name}"]`, "content"));
  fields.set("icon", attrs('link[rel~="icon"]', "href"));

  // Tags that work wherever they stand, so they are looked for in the whole document.
  const named = (attribute, test) =>
    $(`meta[${attribute}]`)
      .toArray()
      .filter((el) => test(String($(el).attr(attribute)).trim().toLowerCase()));
  fields.set(
    "robots",
    named("name", (name) => CRAWLER.test(name)).flatMap((el) =>
      keywordList($(el).attr("content"))
        .map((directive) => directive.toLowerCase())
        .filter((directive) => RESTRICTIVE.has(directive))
        .map(
          (directive) =>
            `${$(el).attr("name").trim().toLowerCase()}: ${directive}`,
        ),
    ),
  );
  fields.set(
    "refresh",
    named("http-equiv", (name) => name === "refresh").map(
      (el) => $(el).attr("content") ?? "",
    ),
  );
  fields.set(
    "base",
    $("base")
      .toArray()
      .map((el) =>
        ["href", "target"]
          .filter((name) => $(el).attr(name) !== undefined)
          .map((name) => `${name}=${$(el).attr(name)}`)
          .join(" "),
      ),
  );
  return fields;
}

// <meta name="robots">, "googlebot", "googlebot-news", "bingbot", … and the two big crawlers not called a bot.
const CRAWLER = /^(robots|yeti|slurp|[a-z0-9-]*bot(-[a-z0-9]+)*)$/;
/** Directives that keep a page out of the index or stop its links from being followed. */
const RESTRICTIVE = new Set(["noindex", "nofollow", "none"]);

const show = (values) =>
  values.length === 0
    ? "(none)"
    : values.map((value) => quote(value, 70)).join(" + ");
const same = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/** Fields an allowlisted route must still share with the baseline's home page. */
const SITE_WIDE = [
  "lang",
  "charset",
  "viewport",
  "icon",
  "google-site-verification",
  "refresh",
  "base",
];

/** What is wrong with the head of a route that is exempt from parity, as "field: expected → candidate". */
function exemptProblems(home, candidate) {
  const problems = [];
  const titles = candidate.get("title");
  if (titles.length !== 1 || titles[0].trim() === "")
    problems.push(`title: one non-empty <title> → ${show(titles)}`);
  for (const field of SITE_WIDE) {
    const expected = home.get(field);
    const actual = candidate.get(field);
    const equal =
      field === "charset"
        ? expected.includes("utf-8") === actual.includes("utf-8")
        : same(expected, actual);
    if (!equal) problems.push(`${field}: ${show(expected)} → ${show(actual)}`);
  }
  return problems;
}

export default {
  name: "head",
  kind: "static",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "head");
    const failed = [];
    const cells = {};
    const diffs = {};
    let pass = 0;

    const home = await ctx.dom("baseline", "/");
    const homeFields = home === null ? null : headFields(home);

    for (const route of ctx.routes) {
      const baseline = await ctx.dom("baseline", route);
      const candidate = await ctx.dom("candidate", route);

      if (candidate === null) {
        // Not something an allowlist entry for the route can accept: there is no head to exempt.
        failed.push({ route, detail: "route missing in candidate" });
        cells[route] = "fail";
        continue;
      }

      const differing = [];
      const before = headFields(baseline);
      const after = headFields(candidate);
      for (const [field, values] of before) {
        if (field === "charset") {
          // Only the presence of a utf-8 charset declaration counts.
          if (values.includes("utf-8") !== after.get(field).includes("utf-8")) {
            differing.push(
              `charset: ${show(values)} → ${show(after.get(field))}`,
            );
          }
        } else if (!same(values, after.get(field))) {
          differing.push(
            `${field}: ${show(values)} → ${show(after.get(field))}`,
          );
        }
      }

      // An allowlisted route may differ from its baseline page, but it is still a page of this site.
      const exempt = ctx.allowed("head", `route:${route}`) !== null;
      const required = !exempt
        ? []
        : homeFields === null
          ? ["the baseline has no home page to take the site-wide tags from"]
          : exemptProblems(homeFields, after);
      if (required.length) {
        diffs[route] = required;
        failed.push({
          route,
          detail: `required on an allowlisted route too: ${required.join("; ")}`,
        });
        cells[route] = "fail";
        continue;
      }

      if (differing.length === 0 || exempt) pass++; // an exempt route was examined: its site-wide tags hold
      if (differing.length === 0) {
        cells[route] = "pass";
        continue;
      }
      diffs[route] = differing;
      const detail = differing.join("; ");
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
      extra: { allowed, diffs },
    };
  },

  selftest: {
    mutations: [
      {
        name: "제목 변경",
        apply(dir) {
          mutateFile(dir, postFiles(dir)[0], (html) =>
            html.replace(/<title>([^<]*)<\/title>/, "<title>$1!</title>"),
          );
        },
      },
      {
        name: "og:image 삭제",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(/<meta property="og:image"[^>]*>/, ""),
          );
        },
      },
      {
        name: "keywords 항목 삭제",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(/(<meta name="keywords" content=")[^,"]*,/, "$1"),
          );
        },
      },

      // Tags only the candidate has.
      {
        name: "후보에만 있는 robots noindex, nofollow",
        apply(dir) {
          addToHead(
            dir,
            postFiles(dir)[0],
            '<meta name="robots" content="noindex, nofollow">',
          );
        },
      },
      {
        name: "후보에만 있는 googlebot none (대문자, body 안)",
        apply(dir) {
          mutateFile(dir, "index.html", (html) =>
            html.replace(
              /(<body[^>]*>)/,
              '$1<META NAME="Googlebot" CONTENT="NONE">',
            ),
          );
        },
      },
      {
        name: "후보에만 있는 meta refresh",
        apply(dir) {
          addToHead(
            dir,
            "index.html",
            '<meta http-equiv="refresh" content="0; url=https://example.com/">',
          );
        },
      },
      {
        name: "후보에만 있는 base 요소",
        apply(dir) {
          addToHead(
            dir,
            postFiles(dir)[0],
            '<base href="https://example.com/">',
          );
        },
      },

      // /404 is allowlisted: its head may differ from the baseline's, but not in these.
      ...[
        ["<title> 비움", /<title>[^<]*<\/title>/, "<title></title>"],
        ["html lang 삭제", /(<html[^>]*?) lang="[^"]*"/, "$1"],
        ["charset meta 삭제", /<meta charset="[^"]*"\s*\/?>/i, ""],
        ["viewport meta 삭제", /<meta name="viewport"[^>]*>/, ""],
        ["파비콘 link 삭제", /<link rel="icon"[^>]*>/, ""],
        [
          "google-site-verification 값 변경",
          /(<meta name="google-site-verification" content=")[^"]*/,
          "$1someone-elses-token",
        ],
        [
          "meta refresh 추가",
          "</head>",
          '<meta http-equiv="refresh" content="0; url=/"></head>',
        ],
      ].map(([name, pattern, replacement]) => ({
        name: `허용한 /404 의 ${name}`,
        apply(dir) {
          mutateFile(dir, "404.html", (html) =>
            html.replace(pattern, replacement),
          );
        },
      })),
    ],

    // Changes that are not differences: the mutated copy must still PASS.
    accepted: [
      {
        name: "색인을 허용하는 robots meta (index, follow, …)",
        apply(dir) {
          for (const rel of ["index.html", ...postFiles(dir)])
            addToHead(
              dir,
              rel,
              '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">',
            );
        },
      },
      {
        name: "허용한 /404 의 robots noindex, follow",
        apply(dir) {
          addToHead(
            dir,
            "404.html",
            '<meta name="robots" content="noindex, follow">',
          );
        },
      },
    ],
  },
};

/** Self-test: put `tag` at the end of <head> of one page of a site copy. */
function addToHead(dir, rel, tag) {
  mutateFile(dir, rel, (html) => html.replace("</head>", `${tag}</head>`));
}
