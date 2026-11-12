import { execFileSync } from "node:child_process";
import path from "node:path";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

/** Root of the checkout this process runs in (a worktree has its own). */
export const repoRoot = git("rev-parse", "--show-toplevel");

/** Root of the main checkout, identical from every worktree. */
export const mainRoot = path.dirname(git("rev-parse", "--path-format=absolute", "--git-common-dir"));

export const isWorktree = repoRoot !== mainRoot;

export const verifyDir = path.join(repoRoot, ".verify");
export const baselineDir = path.join(verifyDir, "baseline");
export const reportDir = path.join(verifyDir, "report");
export const cacheDir = path.join(verifyDir, "cache");
export const distDir = path.join(repoRoot, "dist");
export const checksDir = path.join(repoRoot, "scripts", "verify", "checks");
export const allowlistFile = path.join(repoRoot, "scripts", "verify", "allowlist.json");
