// npm run verify:setup -- [--baseline-ref=<ref>]
//
// Prepares a checkout (main or worktree) for verification:
//   1. node_modules        — `npm ci` if missing
//   2. .verify/baseline    — the production build of <ref> (default: $VERIFY_BASELINE_REF, else origin/main):
//                            the previous production. <ref> is checked out into a temporary detached worktree,
//                            built there and copied here; .verify/baseline.json records { ref, sha, hash }.
//                            Rebuilt only when <ref> resolves to another commit than the recorded one.
//   3. .verify/cache       — recorded third-party responses, shared with the main checkout
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { baselineHash } from "./lib/accept.mjs";
import {
  baselineDir,
  baselineFile,
  cacheDir,
  isWorktree,
  mainRoot,
  repoRoot,
  verifyDir,
} from "./lib/paths.mjs";

const USAGE = "usage: npm run verify:setup -- [--baseline-ref=<git ref>]";

let ref = process.env.VERIFY_BASELINE_REF || "origin/main";
for (const raw of process.argv.slice(2)) {
  const match = /^--baseline-ref=(.+)$/.exec(raw);
  if (!match) {
    console.error(`unknown argument: ${raw}\n${USAGE}`);
    process.exit(2);
  }
  ref = match[1];
}

const started = performance.now();
const done = [];

const git = (args, options = {}) =>
  execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    ...options,
  }).trim();

const tryGit = (args) => {
  try {
    return git(args);
  } catch {
    return null;
  }
};

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: ["ignore", "ignore", "inherit"],
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
  });
  if (result.status !== 0) {
    console.error(`${command} ${args.join(" ")} failed in ${cwd}`);
    process.exit(result.status ?? 1);
  }
};

/** The commit `ref` names, fetched from origin when this clone does not have it. */
function resolveRef(ref) {
  const local = tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
  if (local) return local;
  const branch = /^origin\/(.+)$/.exec(ref)?.[1];
  const spec = branch ? `+${branch}:refs/remotes/origin/${branch}` : ref;
  execFileSync("git", ["fetch", "--quiet", "origin", spec], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  const fetched =
    tryGit(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) ??
    tryGit(["rev-parse", "--verify", "--quiet", "FETCH_HEAD^{commit}"]);
  if (!fetched) {
    console.error(`baseline ref ${ref} names no commit, even after a fetch`);
    process.exit(1);
  }
  return fetched;
}

/** What Astro and Vite write under node_modules/. A linked node_modules leaves them to the worktree. */
const NODE_MODULES_CACHES = new Set([".astro", ".vite", ".cache"]);

/** node_modules of `dir`: links to this checkout's packages when the lockfiles are the same, else `npm ci`. */
function install(dir) {
  const lock = (root) => {
    try {
      return fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
    } catch {
      return null;
    }
  };
  const ours = lock(repoRoot);
  if (ours !== null && ours === lock(dir)) {
    fs.mkdirSync(path.join(dir, "node_modules"));
    for (const entry of fs.readdirSync(path.join(repoRoot, "node_modules")))
      if (!NODE_MODULES_CACHES.has(entry))
        fs.symlinkSync(
          path.join(repoRoot, "node_modules", entry),
          path.join(dir, "node_modules", entry),
        );
    return "linked";
  }
  run("npm", ["ci", "--no-fund", "--no-audit"], dir);
  return "npm ci";
}

if (!fs.existsSync(path.join(repoRoot, "node_modules", ".package-lock.json"))) {
  run("npm", ["ci", "--no-fund", "--no-audit"], repoRoot);
  done.push("npm ci");
}

const sha = resolveRef(ref);
let recorded = null;
try {
  recorded = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
} catch {
  // no baseline yet
}

if (
  recorded?.sha !== sha ||
  !fs.existsSync(path.join(baselineDir, "index.html"))
) {
  const tmp = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "verify-baseline-")),
  );
  const tree = path.join(tmp, "tree");
  try {
    git(["worktree", "add", "--detach", "--force", tree, sha]);
    const how = install(tree);
    run("npm", ["run", "-s", "build"], tree);
    fs.rmSync(baselineDir, { recursive: true, force: true });
    fs.mkdirSync(verifyDir, { recursive: true });
    fs.cpSync(path.join(tree, "dist"), baselineDir, { recursive: true });
    done.push(`baseline ${ref} ${sha.slice(0, 7)} (${how})`);
  } finally {
    tryGit(["worktree", "remove", "--force", tree]);
    fs.rmSync(tmp, { recursive: true, force: true });
    tryGit(["worktree", "prune"]);
  }
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify({ ref, sha, hash: baselineHash(baselineDir) }, null, 2)}\n`,
  );
} else if (recorded.ref !== ref) {
  fs.writeFileSync(
    baselineFile,
    `${JSON.stringify({ ...recorded, ref }, null, 2)}\n`,
  );
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
  `verify:setup ok  node ${process.version}  baseline ${ref} = ${sha.slice(0, 12)}  ${done.length ? done.join(", ") : "nothing to do"}  ${seconds}s`,
);
