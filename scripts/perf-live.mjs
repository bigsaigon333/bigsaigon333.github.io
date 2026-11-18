// perf:live — how fast the deployed site answers from this machine: the first request for a URL against the same
// request repeated right after.
//
//   npm run perf:live                                   # https://bigsaigon333.github.io, 5 repeats
//   npm run perf:live -- --base-url=<url> --rounds=10
//
// GitHub Pages sits behind Fastly, which keeps a response for `max-age=600`. The URLs are the four pages of the perf
// check and the first stylesheet of "/". Per URL:
//   first    the URL as a visitor gets it now. A MISS when nobody asked for it in the last ten minutes: the edge
//            fetches it from GitHub.
//   repeat   the same URL, --rounds more times right after (round-robin over the URLs): the edge has it now.
// A query string does not help to force a miss: Fastly answered `?x=<random>` from its cache (HIT) on 2026-11-18, so
// the only cold request there is is a first one after a quiet spell.
//
// Every request is a new curl process: a new DNS lookup, TCP and TLS handshake, as on a first visit. Per request it
// records TTFB (time_starttransfer), the part after the TLS handshake ("wait": one round trip plus the edge's work),
// total time, status, bytes, and the headers x-cache, x-cache-hits, age, x-served-by, cache-control,
// content-encoding. The POP is the last part of x-served-by ("cache-syd10133-SYD" → SYD), the cache node that had the
// response. Measured from Seoul on 2026-11-18 the answers fall in two groups: about 55 ms (the nearby edge had it)
// and about 250–300 ms (it did not: a MISS fetched from GitHub, or a HIT with age 0 on a far shield such as SYD).
//
// Prints a summary (median, p90, min–max of TTFB per kind, then per x-cache × POP) and writes every sample to
// .verify/report/perf-live.json. Exit code 0 unless a request failed or was not 200. Not a gate: the network between
// here and the edge is not ours.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PAGES } from "./verify/checks/perf.mjs";
import { reportDir } from "./verify/lib/paths.mjs";

const USAGE =
  "usage: npm run perf:live -- [--base-url=https://bigsaigon333.github.io] [--rounds=5]";

const args = { baseUrl: "https://bigsaigon333.github.io", rounds: 5 };
for (const raw of process.argv.slice(2)) {
  const [, name, value] = /^--([a-z-]+)=(.+)$/.exec(raw) ?? [];
  if (name === "base-url") args.baseUrl = value.replace(/\/$/, "");
  else if (name === "rounds" && /^[1-9]\d*$/.test(value))
    args.rounds = Number(value);
  else {
    console.error(`unknown argument: ${raw}\n${USAGE}`);
    process.exit(2);
  }
}

const HEADERS = [
  "x-cache",
  "x-cache-hits",
  "age",
  "x-served-by",
  "cache-control",
  "content-encoding",
];

/** One GET in a fresh curl process. */
function get(url) {
  let out;
  try {
    out = execFileSync(
      "curl",
      [
        "--silent",
        "--show-error",
        "--compressed",
        "--max-time",
        "20",
        "--output",
        "/dev/null",
        "--dump-header",
        "-",
        "--write-out",
        "\n@@%{json}",
        url,
      ],
      { encoding: "utf8" },
    );
  } catch (error) {
    return { error: String(error.stderr || error.message).trim() };
  }
  const at = out.lastIndexOf("\n@@");
  const timing = JSON.parse(out.slice(at + 3));
  const headers = {};
  for (const line of out.slice(0, at).split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const name = line.slice(0, colon).trim().toLowerCase();
      if (HEADERS.includes(name)) headers[name] = line.slice(colon + 1).trim();
    }
  }
  const ms = (seconds) => Math.round(seconds * 1000);
  return {
    status: timing.http_code,
    ttfb: ms(timing.time_starttransfer),
    wait: ms(timing.time_starttransfer - timing.time_appconnect),
    total: ms(timing.time_total),
    bytes: timing.size_download,
    pop: headers["x-served-by"]?.split(/[-,\s]+/).pop() ?? "-",
    ...headers,
  };
}

/** The first stylesheet of "/", so that an asset is measured too (its name changes with every build). */
function firstStylesheet() {
  const home = execFileSync(
    "curl",
    ["--silent", "--compressed", "--max-time", "20", `${args.baseUrl}/`],
    { encoding: "utf8" },
  );
  const href = /<link rel="stylesheet" href="([^"]+)"/.exec(home)?.[1];
  return href ? new URL(href, `${args.baseUrl}/`).pathname : null;
}

// The stylesheet is looked up after the first request for "/", so that one stays a first request.
const samples = [];
const paths = Object.keys(PAGES);
for (const route of paths)
  samples.push({ route, kind: "first", ...get(`${args.baseUrl}${route}`) });
const stylesheet = firstStylesheet();
if (stylesheet) {
  paths.push(stylesheet);
  samples.push({
    route: stylesheet,
    kind: "first",
    ...get(`${args.baseUrl}${stylesheet}`),
  });
}
for (let round = 0; round < args.rounds; round += 1)
  for (const route of paths)
    samples.push({
      route,
      kind: "repeat",
      round,
      ...get(`${args.baseUrl}${route}`),
    });

const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
};
const stats = (list) => {
  const ttfb = list.map((s) => s.ttfb);
  return {
    n: list.length,
    median: quantile(ttfb, 0.5),
    p90: quantile(ttfb, 0.9),
    min: ttfb.length ? Math.min(...ttfb) : null,
    max: ttfb.length ? Math.max(...ttfb) : null,
    waitMedian: quantile(
      list.map((s) => s.wait),
      0.5,
    ),
  };
};
const tally = (values) => {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.entries(counts)
    .map(([value, n]) => `${value}×${n}`)
    .join(" ");
};

const ok = samples.filter((s) => s.status === 200);
const summary = { byKind: {}, byCache: {} };
for (const kind of ["first", "repeat"]) {
  const list = ok.filter((s) => s.kind === kind);
  summary.byKind[kind] = {
    ...stats(list),
    xCache: tally(list.map((s) => s["x-cache"] ?? "-")),
    pop: tally(list.map((s) => s.pop)),
  };
}
for (const s of ok) {
  const key = `${s["x-cache"] ?? "-"} ${s.pop}`;
  (summary.byCache[key] ??= []).push(s);
}
for (const [key, list] of Object.entries(summary.byCache))
  summary.byCache[key] = stats(list);
const bad = samples.filter((s) => s.error || s.status !== 200);

const row = (label, s) =>
  `${label.padEnd(12)} ${String(s.n).padStart(3)}  ${String(s.median).padStart(5)}ms ${String(s.p90).padStart(5)}ms ${`${s.min}–${s.max}`.padStart(10)}ms ${String(s.waitMedian).padStart(6)}ms`;

console.log(
  `perf:live ${args.baseUrl}  ${paths.length} URLs × (1 first + ${args.rounds} repeats)  ${new Date().toISOString()}`,
);
console.log("                n   TTFB median   p90    min–max     wait median");
for (const [kind, s] of Object.entries(summary.byKind))
  console.log(`${row(kind, s)}  ${s.xCache}  ${s.pop}`);
for (const [key, s] of Object.entries(summary.byCache))
  console.log(row(key, s));
console.log("first request per URL:");
for (const s of samples.filter((one) => one.kind === "first"))
  console.log(
    `  ${s.route}  ${s.error ?? `${s.ttfb}ms ${s["x-cache"] ?? "-"} ${s.pop} age ${s.age ?? "-"}`}`,
  );
for (const s of bad)
  console.log(`  FAILED ${s.route}: ${s.error ?? `status ${s.status}`}`);

fs.mkdirSync(reportDir, { recursive: true });
const file = path.join(reportDir, "perf-live.json");
fs.writeFileSync(
  file,
  JSON.stringify(
    { baseUrl: args.baseUrl, at: new Date().toISOString(), summary, samples },
    null,
    2,
  ),
);
console.log(`→ ${path.relative(process.cwd(), file)}`);
process.exit(bad.length ? 1 : 0);
