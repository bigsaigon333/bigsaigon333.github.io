// Accepted differences: what a change is allowed to make different from the baseline (the previous production).
//
// scripts/verify/accepted/<name>.json
//   { "baseline": "<hash>", "reason": "…",
//     "entries": [{ "check": "<name>", "routes": ["<route or glob>"], "reason": "…", "mask": ["<css selector>"]? }] }
//
// A file applies only while its "baseline" equals the hash of the current baseline (baselineHash()); any other file
// is ignored with a one-line notice, so an accept file can never outlive the baseline it was written against.
// An entry without "mask" turns the check's failures on those routes into accepted ones (ACCEPT, not PASS).
// An entry with "mask" (visual and hover only) accepts nothing: it paints the matched elements an opaque fixed colour
// on both sides before the comparison, and the rest of the page must still match.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { acceptedDir } from "./paths.mjs";

/** Checks whose entries may carry a mask: the ones that compare pictures. */
export const MASKABLE = new Set(["visual", "hover"]);

/** The fixed colour a mask paints. */
export const MASK_COLOR = "#ff00ff";

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");

/** sha256 over the sorted (path, sha256(content)) pairs of every file under `dir`. */
export function baselineHash(dir) {
  const files = fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(dir, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    )
    .sort();
  return sha256(
    files
      .map((rel) => `${rel}\0${sha256(fs.readFileSync(path.join(dir, rel)))}\n`)
      .join(""),
  );
}

const hashes = new Map();
/** baselineHash() of `dir`, once per process: a baseline does not change while the checks run. */
export function cachedBaselineHash(dir) {
  const key = path.resolve(dir);
  if (!hashes.has(key)) hashes.set(key, baselineHash(key));
  return hashes.get(key);
}

/** `pattern` with * (no "/") and ** (anything) as a RegExp over a whole route. */
const globToRegExp = (pattern) =>
  new RegExp(
    `^${pattern
      .split(/(\*\*|\*)/)
      .map((part) =>
        part === "**"
          ? ".*"
          : part === "*"
            ? "[^/]*"
            : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("")}$`,
  );

export const routeMatches = (patterns, route) =>
  patterns.some((pattern) => globToRegExp(pattern).test(route));

/** Why `data` is not an accept file, or null. */
function malformed(data) {
  if (typeof data?.baseline !== "string") return 'no "baseline" hash';
  if (typeof data.reason !== "string" || !data.reason.trim())
    return 'no "reason"';
  if (!Array.isArray(data.entries) || data.entries.length === 0)
    return 'no "entries"';
  for (const [index, entry] of data.entries.entries()) {
    if (typeof entry?.check !== "string") return `entry ${index}: no "check"`;
    if (
      !Array.isArray(entry.routes) ||
      entry.routes.length === 0 ||
      !entry.routes.every((route) => typeof route === "string" && route)
    )
      return `entry ${index}: "routes" must be a list of routes`;
    if (typeof entry.reason !== "string" || !entry.reason.trim())
      return `entry ${index}: no "reason"`;
    if (entry.mask !== undefined) {
      if (!MASKABLE.has(entry.check))
        return `entry ${index}: "mask" is for ${[...MASKABLE].join(" and ")} only`;
      if (
        !Array.isArray(entry.mask) ||
        entry.mask.length === 0 ||
        !entry.mask.every(
          (selector) => typeof selector === "string" && selector,
        )
      )
        return `entry ${index}: "mask" must be a list of CSS selectors`;
    }
  }
  return null;
}

/**
 * The accept files of `dir` against a baseline whose hash is `hash`.
 * Returns { entries, notices }: the entries of the files that apply, each { file, check, routes, reason, mask?,
 * used: false }, and one line for every file that does not ("stale accept file ignored: …"). A file that is not
 * an accept file at all throws: a typo must not silently accept nothing.
 */
export function loadAccepts(hash, dir = acceptedDir) {
  const entries = [];
  const notices = [];
  if (hash === null || !fs.existsSync(dir)) return { entries, notices };
  for (const name of fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .sort()) {
    const file = path.join(dir, name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new Error(`accept file ${name} is not JSON: ${error.message}`);
    }
    const problem = malformed(data);
    if (problem) throw new Error(`accept file ${name}: ${problem}`);
    if (data.baseline !== hash) {
      notices.push(
        `stale accept file ignored: ${name} (written for baseline ${data.baseline.slice(0, 12)}, current ${hash.slice(0, 12)})`,
      );
      continue;
    }
    for (const entry of data.entries)
      entries.push({ ...entry, file: name, used: false });
  }
  return { entries, notices };
}

/** Selectors to mask for `check` on `route`; marks nothing used (see markMaskUsed). */
export const masksFor = (entries, check, route) =>
  entries.filter(
    (entry) =>
      entry.mask && entry.check === check && routeMatches(entry.routes, route),
  );

/**
 * Turn the failures of `result` that an entry accepts into accepted ones. Mutates and returns `result`:
 * `accepted` is the list of accepted failures ({ route, detail, file }), `ok` is true when nothing else failed.
 */
export function applyAccepts(entries, result) {
  const accepting = entries.filter(
    (entry) => !entry.mask && entry.check === result.check,
  );
  if (!accepting.length || result.ok || result.vacuous) return result;
  const accepted = [];
  const failed = [];
  for (const item of result.failed) {
    const entry = accepting.find((entry) =>
      routeMatches(entry.routes, item.route),
    );
    if (entry) {
      entry.used = true;
      accepted.push({ ...item, file: entry.file });
    } else failed.push(item);
  }
  if (!accepted.length) return result;
  result.accepted = accepted;
  result.failed = failed;
  result.fail = failed.length;
  result.ok = failed.length === 0;
  return result;
}

/** One line per entry that matched no failure (or, with a mask, masked nothing). */
export const unusedNotices = (entries) =>
  entries
    .filter((entry) => !entry.used)
    .map(
      (entry) =>
        `unused accept entry: ${entry.file} ${entry.check} ${entry.routes.join(",")}${entry.mask ? ` mask ${entry.mask.join(",")}` : ""}`,
    );

/**
 * The accept file for the parity failures of `results`: one entry per check with failing routes.
 * Returns the object to write; throws when there is nothing to accept.
 */
export function acceptFileFor(results, { hash, reason }) {
  const entries = results
    .filter((result) => !result.ok && !result.vacuous && result.failed.length)
    .map((result) => ({
      check: result.check,
      routes: [...new Set(result.failed.map((item) => item.route))].sort(),
      reason,
    }));
  if (!entries.length) throw new Error("no parity failure to accept");
  return { baseline: hash, reason, entries };
}

/**
 * Paint the boxes of every element matching one of `selectors` with MASK_COLOR, on top of everything. Returns the
 * number of elements painted. Runs in the page (Playwright page.evaluate).
 */
export async function paintMasks(page, selectors) {
  if (!selectors.length) return 0;
  return page.evaluate(
    ({ selectors, color }) => {
      let painted = 0;
      for (const element of document.querySelectorAll(selectors.join(","))) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        const cover = document.createElement("div");
        cover.setAttribute("data-verify-mask", "");
        Object.assign(cover.style, {
          position: "absolute",
          left: `${box.left + window.scrollX}px`,
          top: `${box.top + window.scrollY}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          background: color,
          zIndex: "2147483647",
          pointerEvents: "none",
          margin: "0",
          padding: "0",
          border: "0",
        });
        document.documentElement.appendChild(cover);
        painted++;
      }
      return painted;
    },
    { selectors, color: MASK_COLOR },
  );
}
