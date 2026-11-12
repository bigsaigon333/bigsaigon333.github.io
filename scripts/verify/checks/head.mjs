// head — per route, what crawlers, link previews and utterances read from <head>.
//
// Compared exactly: html[lang], <title> (utterances finds the comment thread by it), meta description / author /
// viewport / google-site-verification, canonical, og:*, twitter:*, icon, presence of a utf-8 charset meta.
// meta keywords is compared as a list (split on ",", trimmed, empties dropped).
// One failed item per route lists every differing field as "field: baseline → candidate".
//
// Allowlist item: "route:<route>".
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
  return fields;
}

const show = (values) =>
  values.length === 0
    ? "(none)"
    : values.map((value) => quote(value, 70)).join(" + ");
const same = (a, b) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

export default {
  name: "head",
  kind: "static",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "head");
    const failed = [];
    const cells = {};
    const diffs = {};
    let pass = 0;

    for (const route of ctx.routes) {
      const baseline = await ctx.dom("baseline", route);
      const candidate = await ctx.dom("candidate", route);

      const differing = [];
      if (candidate === null) differing.push("route missing in candidate");
      else {
        const before = headFields(baseline);
        const after = headFields(candidate);
        for (const [field, values] of before) {
          if (field === "charset") {
            // Only the presence of a utf-8 charset declaration counts.
            if (
              values.includes("utf-8") !== after.get(field).includes("utf-8")
            ) {
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
      }

      if (differing.length === 0) {
        pass++;
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
    ],
  },
};
