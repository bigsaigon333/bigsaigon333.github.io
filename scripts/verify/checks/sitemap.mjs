// sitemap — search engines keep finding the same URLs.
//
//   - The set of <loc> values in /sitemap.xml equals the baseline set (lastmod, order and formatting may differ).
//   - /robots.txt is byte-equal.
//
// Allowlist items: "loc:<url>" for a URL that may be missing or extra, "file:/robots.txt".
import fs from "node:fs";
import path from "node:path";

import { load } from "cheerio";

import {
  allowances,
  diffText,
  mutateFile,
  oneLine,
  rawText,
} from "../lib/html.mjs";

/** <loc> of every <url> entry, in document order. */
function locations(xml) {
  const $ = load(xml, { xmlMode: true });
  return $("url > loc")
    .toArray()
    .map((el) => rawText(el).trim());
}

export default {
  name: "sitemap",
  kind: "static",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "sitemap");
    const failed = [];
    let pass = 0;

    const fail = (route, item, detail) => {
      if (!skip(item, detail)) failed.push({ route, detail: oneLine(detail) });
    };

    // /sitemap.xml
    const baselineXml = await ctx.html("baseline", "/sitemap.xml");
    const candidateXml = await ctx.html("candidate", "/sitemap.xml");
    const baseline = baselineXml === null ? [] : locations(baselineXml);
    const candidate = candidateXml === null ? [] : locations(candidateXml);

    if (baselineXml === null)
      failed.push({ route: "/sitemap.xml", detail: "missing in baseline" });
    else if (candidateXml === null)
      failed.push({ route: "/sitemap.xml", detail: "missing in candidate" });
    else {
      const before = new Set(baseline);
      const after = new Set(candidate);
      for (const loc of before) {
        if (after.has(loc)) pass++;
        else
          fail(
            "/sitemap.xml",
            `loc:${loc}`,
            `loc missing in candidate: ${loc}`,
          );
      }
      for (const loc of after) {
        if (!before.has(loc))
          fail("/sitemap.xml", `loc:${loc}`, `loc only in candidate: ${loc}`);
      }
    }

    // /robots.txt
    const baselineRobots = await ctx.html("baseline", "/robots.txt");
    const candidateRobots = await ctx.html("candidate", "/robots.txt");
    if (baselineRobots === null)
      failed.push({ route: "/robots.txt", detail: "missing in baseline" });
    else if (candidateRobots === null)
      fail("/robots.txt", "file:/robots.txt", "missing in candidate");
    else if (baselineRobots !== candidateRobots) {
      fail(
        "/robots.txt",
        "file:/robots.txt",
        `robots.txt ${diffText(baselineRobots, candidateRobots)}`,
      );
    } else pass++;

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      extra: {
        allowed,
        locs: { baseline: baseline.length, candidate: candidate.length },
      },
    };
  },

  selftest: {
    mutations: [
      {
        name: "sitemap url 삭제",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(/<url>[\s\S]*?<\/url>\s*/, ""),
          );
        },
      },
      {
        name: "robots.txt 변경",
        apply(dir) {
          const file = path.join(dir, "robots.txt");
          if (!fs.existsSync(file))
            throw new Error("robots.txt missing in the baseline copy");
          fs.appendFileSync(file, "Disallow: /posts/\n");
        },
      },
    ],
  },
};
