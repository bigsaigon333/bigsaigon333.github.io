// What ties a dist/ built ahead of time to the run that checks it.
//
// CI builds dist/ once (`npm run verify:build`), checks that one build in several jobs (`npm run verify -- --prebuilt`)
// and deploys it. .verify/build.json records which sources the build was made from and what it holds. --prebuilt
// checks the dist/ in front of it against that record and refuses a dist/ that is missing, was changed after the
// build, or was built from other sources than the ones checked out now: such a run fails, it never passes on
// leftovers.
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { baselineHash } from "./accept.mjs";
import { distDir, repoRoot, verifyDir } from "./paths.mjs";

/** Where `npm run verify:build` records its build. */
export const buildFile = path.join(verifyDir, "build.json");

/**
 * The build of `npm run verify` and `npm run verify:build`. --force: every page is rendered from its source (run.mjs
 * says why a plain build is not enough).
 */
export const BUILD_COMMAND = ["npx", "astro", "build", "--force"];

const git = (args) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 1 << 30,
    stdio: ["ignore", "pipe", "ignore"],
  });

/**
 * The sources a build is made from: the commit checked out and a hash of every change to it that git sees (staged,
 * unstaged and untracked files; what .gitignore names, such as dist/, .verify/ and node_modules/, is not a source).
 */
export function sourceState() {
  let commit = null;
  try {
    commit = git(["rev-parse", "--verify", "--quiet", "HEAD"])
      .toString()
      .trim();
  } catch {
    // a repository without a commit: every file is untracked
  }
  const status = git([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const hash = crypto.createHash("sha256").update(status);
  if (commit) hash.update(git(["diff", "HEAD", "--binary"]));
  for (const entry of status.toString().split("\0"))
    if (entry.startsWith("?? ")) {
      const file = path.join(repoRoot, entry.slice(3));
      hash.update(`\0${entry.slice(3)}\0`);
      if (fs.lstatSync(file).isFile()) hash.update(fs.readFileSync(file));
    }
  return { commit, changes: hash.digest("hex") };
}

/** Record the dist/ just built. */
export function writeStamp() {
  const stamp = { ...sourceState(), dist: baselineHash(distDir) };
  fs.mkdirSync(verifyDir, { recursive: true });
  fs.writeFileSync(buildFile, `${JSON.stringify(stamp, null, 2)}\n`);
  return stamp;
}

export function removeStamp() {
  fs.rmSync(buildFile, { force: true });
}

/** null when dist/ is the build .verify/build.json records, made from the sources checked out now; else why not. */
export function checkStamp() {
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(buildFile, "utf8"));
  } catch {
    return "no .verify/build.json: run `npm run verify:build` first";
  }
  if (!fs.existsSync(path.join(distDir, "index.html")))
    return "dist/ has no index.html: run `npm run verify:build` first";
  const now = sourceState();
  if (stamp.commit !== now.commit)
    return `dist/ was built from commit ${stamp.commit ?? "none"}, the checkout is ${now.commit ?? "none"}`;
  if (stamp.changes !== now.changes)
    return "the sources changed after dist/ was built (git status or diff differs)";
  if (stamp.dist !== baselineHash(distDir))
    return "dist/ changed after it was built: its files differ from .verify/build.json";
  return null;
}
