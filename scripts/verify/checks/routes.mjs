// routes — the candidate serves what the baseline serves.
//
//   1. The HTML route set is exactly the baseline's ("/", "/404", "/posts/<id>").
//   2. Every non-HTML file of the baseline exists in the candidate with the same sha256.
//      Files that exist only in the candidate (e.g. _astro/) are fine.
//
// Allowlist items: "route:<route>" and "asset:<relative path>" (a trailing ** matches by prefix).
// Against a deployed site (ctx.candidateUrl) routes that exist only in the candidate cannot be seen.
import fs from "node:fs";
import path from "node:path";

import { allowances, listAssets, listFiles, postFiles, readSiteFile, sha256 } from "../lib/html.mjs";
import { listRoutes } from "../lib/resolve.mjs";

const short = (hash) => hash.slice(0, 12);

export default {
  name: "routes",
  kind: "static",

  async run(ctx) {
    const { allowed, skip } = allowances(ctx, "routes");
    const failed = [];
    const cells = {};
    let pass = 0;

    const remote = Boolean(ctx.candidateUrl);
    if (!remote && !fs.existsSync(ctx.candidateDir)) {
      const relative = path.relative(process.cwd(), ctx.candidateDir) || ".";
      const shown = relative.startsWith("..") ? ctx.candidateDir : relative;
      return {
        ok: false,
        pass: 0,
        fail: 1,
        failed: [{ route: "-", detail: `candidate directory does not exist: ${shown}` }],
      };
    }

    // 1. routes
    const present = new Set();
    if (remote) {
      for (const route of ctx.allRoutes) if ((await ctx.html("candidate", route)) !== null) present.add(route);
    } else {
      for (const route of listRoutes(ctx.candidateDir)) present.add(route);
    }

    for (const route of ctx.allRoutes) {
      if (present.has(route)) {
        pass++;
        cells[route] = "pass";
      } else if (skip(`route:${route}`, "missing in candidate")) {
        cells[route] = "skip";
      } else {
        failed.push({ route, detail: "route missing in candidate" });
        cells[route] = "fail";
      }
    }

    const known = new Set(ctx.allRoutes);
    for (const route of [...present].filter((route) => !known.has(route))) {
      if (skip(`route:${route}`, "only in candidate")) continue;
      failed.push({ route, detail: "route exists only in candidate" });
    }

    // 2. assets
    const assets = listAssets(ctx.baselineDir);
    for (const rel of assets) {
      const baseline = fs.readFileSync(path.join(ctx.baselineDir, rel));
      const candidate = await readSiteFile(ctx, "candidate", rel);

      let problem = null;
      if (candidate === null) problem = "asset missing in candidate";
      else if (sha256(baseline) !== sha256(candidate)) {
        problem = `asset differs: sha256 ${short(sha256(baseline))} → ${short(sha256(candidate))}, ${baseline.length} → ${candidate.length} bytes`;
      }

      if (problem === null) pass++;
      else if (!skip(`asset:${rel}`, problem)) failed.push({ route: `/${rel}`, detail: problem });
    }

    const candidateOnly = remote
      ? null
      : listFiles(ctx.candidateDir).filter((rel) => !rel.endsWith(".html") && !assets.includes(rel));

    return {
      ok: failed.length === 0,
      pass,
      fail: failed.length,
      failed,
      cells,
      extra: {
        allowed,
        routes: { baseline: ctx.allRoutes.length, candidate: present.size },
        assets: { baseline: assets.length },
        candidateOnlyFiles: candidateOnly,
      },
    };
  },

  selftest: {
    mutations: [
      {
        name: "글 HTML 삭제",
        apply(dir) {
          fs.rmSync(path.join(dir, postFiles(dir)[0]));
        },
      },
      {
        name: "자산 내용 변경",
        apply(dir) {
          const file = path.join(dir, "favicon.ico");
          if (!fs.existsSync(file)) throw new Error("favicon.ico missing in the baseline copy");
          fs.appendFileSync(file, "x");
        },
      },
    ],
  },
};
