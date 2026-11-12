// sitemap — search engines keep finding the same URLs.
//
//   - /sitemap.xml is well-formed XML (lib/xml.mjs): an XML declaration, balanced elements, no bare "&".
//     The <loc> values are read leniently, so without this a file a crawler rejects would compare as equal.
//   - Its root element and default namespace are the baseline's.
//   - The set of <loc> values equals the baseline set (lastmod, order and formatting may differ).
//   - /robots.txt is byte-equal.
//
// Allowlist items: "loc:<url>" for a URL that only the candidate lists — never for one it has dropped —
// and "file:/robots.txt".
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
import { allowlistFile } from "../lib/paths.mjs";
import { inspectXml } from "../lib/xml.mjs";

/** <loc> of every <url> entry, in document order. */
function locations(xml) {
  const $ = load(xml, { xmlMode: true });
  return $("url > loc")
    .toArray()
    .map((el) => rawText(el).trim());
}

const rootOf = (xml) => {
  const { root } = inspectXml(xml);
  return root
    ? `<${root.name} xmlns="${root.attributes.xmlns ?? ""}">`
    : "(no root element)";
};

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
    const refuse = (route, detail) =>
      failed.push({ route, detail: oneLine(detail) });

    // /sitemap.xml
    const baselineXml = await ctx.html("baseline", "/sitemap.xml");
    const candidateXml = await ctx.html("candidate", "/sitemap.xml");
    const baseline = baselineXml === null ? [] : locations(baselineXml);
    const candidate = candidateXml === null ? [] : locations(candidateXml);

    if (baselineXml === null) refuse("/sitemap.xml", "missing in baseline");
    else if (candidateXml === null)
      refuse("/sitemap.xml", "missing in candidate");
    else {
      const { problem } = inspectXml(candidateXml);
      if (problem) refuse("/sitemap.xml", `not well-formed XML: ${problem}`);
      else pass++;

      if (rootOf(baselineXml) !== rootOf(candidateXml))
        refuse(
          "/sitemap.xml",
          `root element: ${rootOf(baselineXml)} → ${rootOf(candidateXml)}`,
        );

      const before = new Set(baseline);
      const after = new Set(candidate);
      for (const loc of before) {
        if (after.has(loc)) pass++;
        // No allowlist here: an entry is the decision to accept a URL the new sitemap adds. The same entry
        // must not also accept that URL disappearing from a sitemap that used to list it.
        else refuse("/sitemap.xml", `loc missing in candidate: ${loc}`);
      }
      for (const loc of after) {
        if (!before.has(loc))
          fail("/sitemap.xml", `loc:${loc}`, `loc only in candidate: ${loc}`);
      }
    }

    // /robots.txt
    const baselineRobots = await ctx.html("baseline", "/robots.txt");
    const candidateRobots = await ctx.html("candidate", "/robots.txt");
    if (baselineRobots === null) refuse("/robots.txt", "missing in baseline");
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

      // Not XML any more, with every <loc> still where the lenient reader finds it.
      {
        name: 'XML 선언이 없고 "<note>a & b</urlset" 로 끝나는 sitemap',
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml
              .replace(/^<\?xml[^>]*\?>\s*/, "")
              .replace(/<\/urlset>\s*$/, "<note>a & b</urlset"),
          );
        },
      },
      {
        name: "sitemap 의 XML 선언 삭제",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(/^<\?xml[^>]*\?>\s*/, ""),
          );
        },
      },
      {
        name: "sitemap 의 닫는 태그 삭제",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(/<\/urlset>\s*$/, ""),
          );
        },
      },
      {
        name: "sitemap 에 이스케이프하지 않은 &",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace("</urlset>", "<note>a & b</note></urlset>"),
          );
        },
      },
      {
        name: "sitemap 의 루트 요소 네임스페이스 변경",
        apply(dir) {
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace(
              /(<urlset[^>]*?xmlns=")[^"]*/,
              "$1http://example.com/not-a-sitemap",
            ),
          );
        },
      },

      // The allowlist accepts a URL the candidate adds. Here the same URL is one the candidate has dropped:
      // the baseline lists it, the candidate (an untouched copy of the real baseline) does not.
      {
        name: "허용한 loc 이 기준선에는 있고 후보에는 없음",
        baseline(dir) {
          const entries =
            JSON.parse(fs.readFileSync(allowlistFile, "utf8")).entries ?? [];
          const accepted = entries.find(
            (entry) =>
              entry.check === "sitemap" && entry.item.startsWith("loc:"),
          );
          // Without such an entry the URL is simply one the candidate lacks, which must fail as well.
          const loc = accepted
            ? accepted.item.slice("loc:".length)
            : "https://example.com/not-in-the-candidate";
          mutateFile(dir, "sitemap.xml", (xml) =>
            xml.replace("</urlset>", `<url><loc>${loc}</loc></url>\n</urlset>`),
          );
        },
      },
    ],
  },
};
