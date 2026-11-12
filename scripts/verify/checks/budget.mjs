// budget — the migration must not ship more JavaScript than the site it replaces.
//
// Per route, on both sides (bytes as stored, uncompressed):
//   JS   internal script[src] and modulepreload files + inline scripts (not application/json, application/ld+json)
//   CSS  internal stylesheet files + inline <style> elements
// External files (other origins) are counted but have no bytes. A route FAILS when candidate JS bytes exceed
// baseline JS bytes. CSS is reported only. The per-route table is in the report under extra.table.
//
// Allowlist item: "route:<route>".
import fs from "node:fs";
import path from "node:path";

import { allowances, internalPath, mutateFile, probe, rawText } from "../lib/html.mjs";

const DATA_TYPES = new Set(["application/json", "application/ld+json"]);
const bytesOf = (text) => Buffer.byteLength(text, "utf8");

/** { bytes, files, inline, external, missing } of one kind of resource on one page. */
async function weigh(ctx, side, route, references, inlineTexts) {
  const total = { bytes: 0, files: 0, inline: inlineTexts.length, external: 0, missing: [] };
  for (const text of inlineTexts) total.bytes += bytesOf(text);

  const seen = new Set();
  for (const reference of references) {
    const pathname = internalPath(reference, route);
    if (pathname === null) {
      total.external++;
      continue;
    }
    if (seen.has(pathname)) continue;
    seen.add(pathname);
    const { status, body } = await probe(ctx, side, pathname);
    if (status === 200) {
      total.files++;
      total.bytes += body.length;
    } else total.missing.push(pathname); // the links check reports it
  }
  if (total.missing.length === 0) delete total.missing;
  return total;
}

async function measure(ctx, side, route) {
  const $ = await ctx.dom(side, route);
  if ($ === null) return null;
  const attrs = (selector, attribute) =>
    $(selector)
      .toArray()
      .map((el) => $(el).attr(attribute));

  const inlineScripts = $("script:not([src])")
    .toArray()
    .filter((el) => !DATA_TYPES.has(($(el).attr("type") ?? "").trim().toLowerCase()))
    .map(rawText);
  const inlineStyles = $("style").toArray().map(rawText);

  return {
    js: await weigh(
      ctx,
      side,
      route,
      [...attrs("script[src]", "src"), ...attrs('link[rel~="modulepreload"][href]', "href")],
      inlineScripts,
    ),
    css: await weigh(ctx, side, route, attrs('link[rel~="stylesheet"][href]', "href"), inlineStyles),
  };
}

export default {
  name: "budget",
  kind: "static",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "budget");
    const failed = [];
    const cells = {};
    const table = [];
    let pass = 0;

    for (const route of ctx.routes) {
      const baseline = await measure(ctx, "baseline", route);
      const candidate = await measure(ctx, "candidate", route);

      let problem = null;
      if (candidate === null) problem = "route missing in candidate";
      else {
        table.push({
          route,
          js: { baseline: baseline.js, candidate: candidate.js, deltaBytes: candidate.js.bytes - baseline.js.bytes },
          css: {
            baseline: baseline.css,
            candidate: candidate.css,
            deltaBytes: candidate.css.bytes - baseline.css.bytes,
          },
        });
        if (candidate.js.bytes > baseline.js.bytes) {
          problem = `JS ${baseline.js.bytes} → ${candidate.js.bytes} bytes (+${candidate.js.bytes - baseline.js.bytes})`;
        }
      }

      if (problem === null) {
        pass++;
        cells[route] = "pass";
      } else if (skip(`route:${route}`, problem)) cells[route] = "skip";
      else {
        failed.push({ route, detail: problem });
        cells[route] = "fail";
      }
    }

    const sum = (pick) => table.reduce((total, row) => total + pick(row), 0);
    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: {
        allowed,
        // Bytes summed over the compared routes; a file shared by several pages counts once per page.
        totals: {
          js: { baseline: sum((row) => row.js.baseline.bytes), candidate: sum((row) => row.js.candidate.bytes) },
          css: { baseline: sum((row) => row.css.baseline.bytes), candidate: sum((row) => row.css.candidate.bytes) },
        },
        // One row per route: { bytes, files, inline, external } for JS and CSS on both sides.
        table,
      },
    };
  },

  selftest: {
    mutations: [
      {
        name: "큰 인라인 스크립트 추가",
        apply(dir) {
          const script = `<script>window.__budgetMutation="${"x".repeat(200_000)}"</script>`;
          mutateFile(dir, "index.html", (html) => html.replace("</body>", `${script}</body>`));
        },
      },
      {
        name: "스크립트 파일 추가",
        apply(dir) {
          fs.writeFileSync(path.join(dir, "budget-mutation.js"), `window.__budgetMutation="${"x".repeat(200_000)}"`);
          mutateFile(dir, "index.html", (html) =>
            html.replace("</body>", '<script src="/budget-mutation.js"></script></body>'),
          );
        },
      },
    ],
  },
};
