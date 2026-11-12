// npm run verify:setup
//
// Prepares a checkout (main or worktree) for verification:
//   1. node_modules        — `npm ci` if missing
//   2. .verify/baseline    — the currently deployed site, extracted from origin/gh-pages
//   3. .verify/cache       — recorded third-party responses, shared with the main checkout
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  baselineDir,
  cacheDir,
  isWorktree,
  mainRoot,
  repoRoot,
  verifyDir,
} from "./lib/paths.mjs";

const started = performance.now();
const done = [];

if (!fs.existsSync(path.join(repoRoot, "node_modules", ".package-lock.json"))) {
  const run = spawnSync("npm", ["ci", "--no-fund", "--no-audit"], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (run.status !== 0) process.exit(run.status ?? 1);
  done.push("npm ci");
}

if (!fs.existsSync(path.join(baselineDir, "index.html"))) {
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  try {
    git("rev-parse", "--verify", "--quiet", "origin/gh-pages");
  } catch {
    execFileSync(
      "git",
      ["fetch", "origin", "gh-pages:refs/remotes/origin/gh-pages"],
      { cwd: repoRoot, stdio: "inherit" },
    );
  }
  fs.mkdirSync(baselineDir, { recursive: true });
  const archive = spawnSync("git", ["archive", "origin/gh-pages"], {
    cwd: repoRoot,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (archive.status !== 0) {
    console.error("git archive origin/gh-pages failed");
    process.exit(1);
  }
  const untar = spawnSync("tar", ["-x", "-C", baselineDir], {
    input: archive.stdout,
  });
  if (untar.status !== 0) {
    console.error("extracting the baseline failed");
    process.exit(1);
  }
  done.push("baseline");
}

if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(verifyDir, { recursive: true });
  if (isWorktree) {
    const shared = path.join(mainRoot, ".verify", "cache");
    fs.mkdirSync(shared, { recursive: true });
    fs.symlinkSync(shared, cacheDir, "dir");
    done.push("cache (linked)");
  } else {
    fs.mkdirSync(cacheDir, { recursive: true });
    done.push("cache");
  }
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
console.log(
  `verify:setup ok  node ${process.version}  ${done.length ? done.join(", ") : "nothing to do"}  ${seconds}s`,
);
