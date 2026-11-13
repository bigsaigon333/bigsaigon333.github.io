// node scripts/release.mjs --branch=release/<name> [--from=<ref>] [--message=<msg>] [--dry-run]
//
// Builds the branch that main receives. main gets the product (the site) and the tooling that keeps
// being used after this migration: the verification harness (scripts/verify/) and its npm scripts
// and devDependencies, which CI runs before every deploy. The one-off tooling of the migration —
// docs/ (plan, learning notes), the progress dashboard (scripts/progress/), this file and
// scripts/notes-lint.mjs, the npm scripts that run them, and their ignore entries — stays on the
// work branch astro, which is never merged into main. So does labs/: separate Astro projects for
// experiments (own package.json and checks) that the root lint and type check exclude.
//
// The release branch is one commit on top of origin/main. Its tree is the tree of --from
// (default HEAD) with the one-off tooling removed. It is built in a temporary git worktree under
// os.tmpdir() and verified there; the first failure stops the run:
//   (a) no excluded path, npm script, devDependency or ignore entry is left
//   (b) no tracked file, package-lock.json included, mentions the one-off tooling (MENTIONS)
//   (c) npm ci, lint, typecheck, check, build, prettier --check, verify:setup and verify pass in
//       the release tree (verify with VERIFY_REPORTER=off: the harness must work on its own)
//   (d) the release tree's dist/ is byte-identical to a build of --from, made with the same
//       commands in a second temporary checkout of --from (diff -r)
// Temporary worktrees are always removed. The branch is kept only when every step passed and
// --dry-run is not given. Nothing is pushed.
//
//   --message=<msg>       commit message (default below); the Co-Authored-By trailer is appended
//   --dry-run             do everything, then delete the branch
//   --compare-from=<ref>  self-test of (d): build this ref instead of --from for the comparison.
//                         Needs --dry-run, so a branch is never kept from a different comparison.
//
// npm output goes to log files under os.tmpdir(); a failing step prints its log's path.
// Exit codes: 0 every step passed, 1 refused or a step failed, 2 bad command line.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

const DEFAULT_MESSAGE = "feat: 블로그를 Astro 로 옮긴다";
const TRAILER = "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";

// The one-off tooling: removed from the release tree (directories and files).
const EXCLUDED_PATHS = [
  "docs",
  "scripts/progress",
  "scripts/release.mjs",
  "scripts/notes-lint.mjs",
  "labs",
];
// No tracked file of the release may live under these (the tooling's output and agent scratch too).
// .verify/ is the harness's local output: the harness ships, its output never does.
const EXCLUDED_PREFIXES = [
  "docs/",
  "scripts/progress/",
  "scripts/release.mjs",
  "scripts/notes-lint.mjs",
  "labs/",
  ".verify/",
  ".progress/",
  ".superpowers/",
  ".claude/",
];
// devDependencies that only the one-off tooling imports. None today: the dashboard, this file and
// notes-lint use Node built-ins only, and the harness's packages ship with the harness.
const TOOLING_DEV_DEPENDENCIES = [];
// The ignore entries that exist for the one-off tooling. A comment goes with them when its block
// empties.
const IGNORE_ENTRIES = {
  ".gitignore": ["/.progress/", "/.superpowers/", "/.claude/worktrees/"],
  ".prettierignore": [".progress", ".claude", "docs/astro-notes/_refs"],
};
const OXLINT_IGNORE_PATTERNS = ["/.progress", "/.claude", "/docs", "/labs"];
// tsconfig.json "exclude" entries that exist for the one-off tooling.
const TSCONFIG_EXCLUDES = ["labs"];

// A repository path, not a URL segment: "scripts/x", "./scripts/x", "../../docs/x", "`docs/x`"
// match; "react-scripts/lib" and "https://developer.mozilla.org/en-US/docs/Web" do not.
const PATH_START = String.raw`(?<=^|[^\w/.-]|\.\/)`;
// An npm script runs the one-off tooling when its command names one of its paths.
const ONE_OFF_PATH = String.raw`scripts/(?:progress/|release\.mjs|notes-lint\.mjs)`;
const RUNS_TOOLING = new RegExp(`${PATH_START}${ONE_OFF_PATH}`);

// Identifiers that mean "this file knows about the one-off tooling". Each is narrowed so that
// product text (posts, comments, package-lock.json) does not match it by accident:
//   paths              as a repository path (PATH_START), not inside a URL or a package path
//   .progress          as a dot-name ("/.progress/", "`.progress`"), not a member like "x.progress"
//   progress:          as an npm script name ("progress:watch"), not "cancel-in-progress: true"
//   PROGRESS_          the dashboard's environment variables
//   .claude            any dot-name use, which covers ".claude/worktrees"
const MENTIONS = [
  ["one-off script path", new RegExp(`${PATH_START}${ONE_OFF_PATH}`)],
  ["docs/", new RegExp(`${PATH_START}docs/`)],
  ["astro-notes", /astro-notes/i],
  ["notes-lint", /notes-lint/i],
  ["release.mjs", /release\.mjs/],
  [".progress", /(?<![\w$])\.progress(?![\w-])/],
  ["progress:<name>", /(?<![\w-])progress:\w/],
  ["npm run progress", /\bnpm run (?:-s )?progress\b/],
  ["PROGRESS_<name>", /\bPROGRESS_[A-Z]/],
  ["dashboard", /dashboard|대시보드/i],
  ["superpowers", /superpowers/i],
  [".claude", /(?<![\w$])\.claude(?![\w-])/],
  ["labs", /(?<![\w-])labs(?![\w-])/],
];

class Failure extends Error {}
const fail = (reason) => {
  throw new Failure(reason);
};

const started = performance.now();
const elapsed = (since) =>
  `${((performance.now() - since) / 1000).toFixed(1)}s`;
const say = (status, step, detail = "") =>
  console.log(`${status.padEnd(5)} ${step.padEnd(15)} ${detail}`.trimEnd());

// ---------------------------------------------------------------- command line

const USAGE =
  "usage: node scripts/release.mjs --branch=release/<name> [--from=<ref>] [--message=<msg>] [--dry-run] [--compare-from=<ref>]";

function usage(problem) {
  console.error(`${problem}\n${USAGE}`);
  process.exit(2);
}

function parseArgs(argv) {
  const args = { from: "HEAD", message: DEFAULT_MESSAGE, dryRun: false };
  const valued = {
    "--branch": "branch",
    "--from": "from",
    "--message": "message",
    "--compare-from": "compareFrom",
  };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg : arg.slice(0, eq);
    if (!(key in valued)) usage(`unknown argument: ${arg}`);
    const value = eq === -1 ? "" : arg.slice(eq + 1);
    if (!value.trim()) usage(`${key} needs a value`);
    args[valued[key]] = value;
  }
  if (!args.branch) usage("--branch=release/<name> is required");
  if (!/^release\/[^/]/.test(args.branch))
    usage(`--branch must start with release/: ${args.branch}`);
  if (args.compareFrom !== undefined && !args.dryRun)
    usage("--compare-from is a self-test of step (d) and needs --dry-run");
  return args;
}

// ---------------------------------------------------------------- processes

// A git hook or a parent git process may have set these; they would point git at another repository.
const cleanEnv = { ...process.env };
for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"])
  delete cleanEnv[name];

const firstLine = (text) =>
  String(text ?? "")
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean) ?? "";

function git(cwd, ...args) {
  const run = spawnSync("git", args, {
    cwd,
    env: cleanEnv,
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
  if (run.status !== 0)
    fail(`git ${args[0]} failed: ${firstLine(run.stderr) || run.status}`);
  return run.stdout;
}

const gitOk = (cwd, ...args) =>
  spawnSync("git", args, { cwd, env: cleanEnv, stdio: "ignore" }).status === 0;

const resolveCommit = (cwd, ref) => {
  const run = spawnSync(
    "git",
    ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`],
    { cwd, env: cleanEnv, encoding: "utf8" },
  );
  if (run.status !== 0) fail(`${ref} is not a commit`);
  return run.stdout.trim();
};

const short = (sha) => sha.slice(0, 7);

const lsFiles = (cwd, ...paths) =>
  git(cwd, "ls-files", "-z", "--", ...paths)
    .split("\0")
    .filter(Boolean);

let logDir;

// Runs a product command with its output in a log file. HUSKY=0: `npm ci` runs the prepare script,
// and husky would otherwise set core.hooksPath in the repository's shared config.
// VERIFY_REPORTER=off: the release tree's verify runs must not use a local reporter of the main
// checkout; CI has none either.
function run(cwd, label, command, args, logName) {
  const log = path.join(logDir, `${logName}.log`);
  const fd = fs.openSync(log, "w");
  const since = performance.now();
  const result = spawnSync(command, args, {
    cwd,
    env: {
      ...cleanEnv,
      HUSKY: "0",
      VERIFY_REPORTER: "off",
      ASTRO_TELEMETRY_DISABLED: "1",
      npm_config_update_notifier: "false",
    },
    stdio: ["ignore", fd, fd],
  });
  fs.closeSync(fd);
  if (result.status !== 0)
    fail(
      `${label} exited with ${result.status ?? result.signal ?? result.error?.code}; log: ${log}`,
    );
  return elapsed(since);
}

// ---------------------------------------------------------------- transforms

// Drops the given entries. A block (lines between blank lines) that loses all its entries loses its
// comments too, so "# agent scratch" does not outlive "/.superpowers/".
function dropIgnoreEntries(text, entries) {
  const isEntry = (line) => line.trim() !== "" && !line.trim().startsWith("#");
  let removed = 0;
  const blocks = [];
  for (const block of text.replace(/\n+$/, "").split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const kept = lines.filter((line) => !entries.includes(line.trim()));
    removed += lines.length - kept.length;
    if (lines.some(isEntry) && !kept.some(isEntry)) {
      removed += kept.length;
      continue;
    }
    blocks.push(kept.join("\n"));
  }
  return { text: `${blocks.join("\n\n")}\n`, removed };
}

// JSON with // and /* */ comments (the .oxlintrc.json format).
function parseJsonc(text) {
  let out = "";
  for (let i = 0; i < text.length;) {
    if (text[i] === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else if (text.startsWith("//", i)) {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (text.startsWith("/*", i)) {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? text.length : end + 2;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return JSON.parse(out);
}

// An array of strings the way Prettier prints it in a .json file: on one line when it fits in 80
// columns, otherwise one item per line.
function printJsonArray(indent, key, values, comma) {
  const items = values.map((value) => JSON.stringify(value));
  const flat = `${indent}${key}[${items.join(", ")}]${comma}`;
  if (flat.length <= 80) return flat;
  return `${indent}${key}[\n${items.map((item) => `${indent}  ${item}`).join(",\n")}\n${indent}]${comma}`;
}

// A JSON(C) config without some entries of one of its top-level string arrays (.oxlintrc.json
// "ignorePatterns", tsconfig.json "exclude"). The result is checked against the same change made
// on the parsed object.
function filterConfigArray(name, original, key, drop) {
  const config = parseJsonc(original);
  const expected = structuredClone(config);
  if (config[key])
    expected[key] = config[key].filter((value) => !drop.includes(value));

  const text = original.replace(
    new RegExp(`^([ \\t]*)("${key}":\\s*)\\[[^\\]]*\\](,?)`, "m"),
    (_, indent, prefix, comma) =>
      printJsonArray(indent, prefix, expected[key], comma),
  );

  let parsed;
  try {
    parsed = parseJsonc(text);
  } catch (error) {
    fail(`${name} is not valid after filtering: ${error.message}`);
  }
  if (!isDeepStrictEqual(parsed, expected))
    fail(`${name}: the filtered text does not match the filtered config`);
  const removed = (config[key] ?? []).length - (expected[key] ?? []).length;
  return { text, removed };
}

// The configs whose arrays carry one-off entries: [file, key, entries].
const CONFIG_ARRAYS = [
  [".oxlintrc.json", "ignorePatterns", OXLINT_IGNORE_PATTERNS],
  ["tsconfig.json", "exclude", TSCONFIG_EXCLUDES],
];

// ---------------------------------------------------------------- steps

const args = parseArgs(process.argv.slice(2));
const repo = git(import.meta.dirname, "rev-parse", "--show-toplevel").trim();

const state = {
  tmp: null,
  worktrees: [],
  branchCreated: false,
  keepBranch: false,
};

function step(name, fn) {
  const since = performance.now();
  let detail;
  try {
    detail = fn();
  } catch (error) {
    const reason = error?.message ?? String(error);
    say("FAIL", name, reason);
    throw new Failure(reason, { cause: "reported" });
  }
  const took = performance.now() - since > 1000 ? `  (${elapsed(since)})` : "";
  say("ok", name, `${detail ?? ""}${took}`);
}

function cleanup() {
  let removed = 0;
  let stale = false;
  for (const dir of state.worktrees.reverse()) {
    if (!gitOk(repo, "worktree", "remove", "--force", dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      stale = true;
    }
    removed += 1;
  }
  if (state.tmp) fs.rmSync(state.tmp, { recursive: true, force: true });
  // Only when a directory had to be deleted by hand: prune drops its leftover registration.
  if (stale) gitOk(repo, "worktree", "prune");
  let branch = "";
  const exists = gitOk(
    repo,
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${args.branch}`,
  );
  if (state.branchCreated && exists) {
    if (state.keepBranch) branch = `; kept ${args.branch}`;
    else if (gitOk(repo, "branch", "-D", "--quiet", args.branch))
      branch = `; deleted ${args.branch}`;
    else branch = `; could not delete ${args.branch}`;
  }
  say("ok", "cleanup", `${removed} temporary worktree(s) removed${branch}`);
}

let fromSha;
let compareSha;
let baseSha;
let releaseDir;
let compareDir;
let commitSha;
const report = {};

function main() {
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), "blog-release-logs-"));

  step("preflight", () => {
    if (!gitOk(repo, "check-ref-format", "--branch", args.branch))
      fail(`${args.branch} is not a valid branch name`);
    const dirty = git(repo, "status", "--porcelain", "--untracked-files=all")
      .split("\n")
      .filter(Boolean);
    if (dirty.length)
      fail(
        `refused: the working tree is dirty (${dirty.length} path(s), e.g. ${dirty[0].slice(3)})`,
      );
    for (const ref of [
      `refs/heads/${args.branch}`,
      `refs/remotes/origin/${args.branch}`,
    ]) {
      if (gitOk(repo, "rev-parse", "--verify", "--quiet", ref))
        fail(`refused: ${ref.replace(/^refs\//, "")} already exists`);
    }
    fromSha = resolveCommit(repo, args.from);
    compareSha = resolveCommit(repo, args.compareFrom ?? args.from);
    const compare =
      compareSha === fromSha
        ? ""
        : `, (d) compares with ${short(compareSha)} (self-test)`;
    return `clean, ${args.branch} is new, from ${args.from} = ${short(fromSha)}${compare}${args.dryRun ? ", dry run" : ""}`;
  });

  step("fetch", () => {
    git(repo, "fetch", "--quiet", "origin", "main");
    baseSha = resolveCommit(repo, "refs/remotes/origin/main");
    return `origin/main = ${short(baseSha)}`;
  });

  step("worktree", () => {
    state.tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blog-release-"));
    releaseDir = path.join(state.tmp, "release");
    // Registered before the call so that cleanup also handles a half-made worktree or branch
    // (preflight saw that the branch did not exist).
    state.worktrees.push(releaseDir);
    state.branchCreated = true;
    git(
      repo,
      "worktree",
      "add",
      "--quiet",
      "--no-track",
      "-b",
      args.branch,
      releaseDir,
      baseSha,
    );
    return `${releaseDir} on ${args.branch} = origin/main`;
  });

  step("replace", () => {
    if (lsFiles(releaseDir).length)
      git(releaseDir, "rm", "-r", "-q", "--", ".");
    const archive = spawnSync("git", ["archive", "--format=tar", fromSha], {
      cwd: repo,
      env: cleanEnv,
      maxBuffer: 1 << 30,
    });
    if (archive.status !== 0)
      fail(
        `git archive ${short(fromSha)} failed: ${firstLine(archive.stderr)}`,
      );
    const untar = spawnSync("tar", ["-x", "-f", "-", "-C", releaseDir], {
      input: archive.stdout,
    });
    if (untar.status !== 0) fail(`tar -x failed: ${firstLine(untar.stderr)}`);
    git(releaseDir, "add", "-A");
    const tree = git(releaseDir, "write-tree").trim();
    if (tree !== git(repo, "rev-parse", `${fromSha}^{tree}`).trim())
      fail(
        `the extracted files do not reproduce the tree of ${short(fromSha)}`,
      );
    return `${lsFiles(releaseDir).length} files, tree identical to ${short(fromSha)}`;
  });

  step("remove", () =>
    EXCLUDED_PATHS.map((entry) => {
      const count = lsFiles(releaseDir, entry).length;
      if (count === 0)
        fail(`${entry} is not in ${short(fromSha)}; is EXCLUDED_PATHS stale?`);
      fs.rmSync(path.join(releaseDir, entry), { recursive: true, force: true });
      return `${entry} (${count} files)`;
    }).join(", "),
  );

  step("package.json", () => {
    const file = path.join(releaseDir, "package.json");
    const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
    const scripts = Object.keys(pkg.scripts ?? {}).filter((name) =>
      RUNS_TOOLING.test(pkg.scripts[name]),
    );
    for (const name of scripts) delete pkg.scripts[name];
    fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
    const shipped = TOOLING_DEV_DEPENDENCIES.filter(
      (name) => name in (pkg.dependencies ?? {}),
    );
    if (shipped.length)
      fail(`${shipped.join(", ")} is in dependencies, so the product uses it`);
    report.devDependencies = TOOLING_DEV_DEPENDENCIES.filter(
      (name) => name in (pkg.devDependencies ?? {}),
    );
    return `scripts −${scripts.length} (${scripts.join(", ")})`;
  });

  step("package-lock", () => {
    const file = path.join(releaseDir, "package-lock.json");
    const before = JSON.parse(fs.readFileSync(file, "utf8"));
    const names = report.devDependencies;
    if (names.length) {
      // --package-lock-only: edit package.json and the lockfile, resolve nothing, install nothing.
      run(
        releaseDir,
        "npm uninstall",
        "npm",
        [
          "uninstall",
          "--package-lock-only",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          ...names,
        ],
        "release-npm-uninstall",
      );
    }
    const after = JSON.parse(fs.readFileSync(file, "utf8"));
    const old = before.packages ?? {};
    const now = after.packages ?? {};

    for (const key of ["name", "version", "lockfileVersion", "requires"]) {
      if (!isDeepStrictEqual(before[key], after[key]))
        fail(`package-lock.json: "${key}" changed`);
    }
    const root = structuredClone(old[""]);
    for (const name of names) delete root.devDependencies[name];
    if (!isDeepStrictEqual(now[""], root))
      fail(
        "package-lock.json: the root entry changed beyond the removed devDependencies",
      );

    const removed = Object.keys(old).filter((key) => !(key in now));
    const added = Object.keys(now).filter((key) => !(key in old));
    const kept = Object.keys(now).filter((key) => key !== "" && key in old);
    const resolved = kept.filter((key) =>
      ["version", "resolved", "integrity"].some(
        (field) => old[key][field] !== now[key][field],
      ),
    );
    const flags = kept.filter(
      (key) =>
        !resolved.includes(key) && !isDeepStrictEqual(old[key], now[key]),
    );
    if (added.length || resolved.length)
      fail(
        `npm re-resolved packages: ${added.length} added, ${resolved.length} changed version (e.g. ${[...added, ...resolved][0]})`,
      );
    const missing = names.filter(
      (name) => !removed.includes(`node_modules/${name}`),
    );
    if (missing.length)
      fail(`package-lock.json still has ${missing.join(", ")}`);

    const [insertions = "0", deletions = "0"] = git(
      releaseDir,
      "diff",
      "--numstat",
      fromSha,
      "--",
      "package-lock.json",
    ).split("\t");
    report.lockfile = `−${removed.length} entries (${names.length} devDependencies + ${removed.length - names.length} only they needed), +${added.length}, ${resolved.length + flags.length} other packages changed; +${insertions} −${deletions} lines`;
    return report.lockfile;
  });

  step("ignore files", () => {
    const parts = [];
    for (const [name, entries] of Object.entries(IGNORE_ENTRIES)) {
      const file = path.join(releaseDir, name);
      if (!fs.existsSync(file)) continue;
      const { text, removed } = dropIgnoreEntries(
        fs.readFileSync(file, "utf8"),
        entries,
      );
      fs.writeFileSync(file, text);
      parts.push(`${name} −${removed} lines`);
    }
    for (const [name, key, entries] of CONFIG_ARRAYS) {
      const file = path.join(releaseDir, name);
      if (!fs.existsSync(file)) continue;
      const { text, removed } = filterConfigArray(
        name,
        fs.readFileSync(file, "utf8"),
        key,
        entries,
      );
      fs.writeFileSync(file, text);
      parts.push(`${name} −${removed} ${key}`);
    }
    git(releaseDir, "add", "-A");
    return parts.join(", ");
  });

  step("(a) excluded", () => {
    const files = lsFiles(releaseDir);
    const tracked = files.find((file) =>
      EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)),
    );
    if (tracked) fail(`${tracked} is in the release tree`);
    const onDisk = EXCLUDED_PATHS.find((entry) =>
      fs.existsSync(path.join(releaseDir, entry)),
    );
    if (onDisk) fail(`${onDisk} exists in the release tree`);

    const pkg = JSON.parse(
      fs.readFileSync(path.join(releaseDir, "package.json"), "utf8"),
    );
    const scripts = Object.entries(pkg.scripts ?? {})
      .filter(([, command]) => RUNS_TOOLING.test(command))
      .map(([name]) => name);
    if (scripts.length) fail(`package.json still has ${scripts.join(", ")}`);
    const deps = TOOLING_DEV_DEPENDENCIES.filter(
      (name) =>
        name in (pkg.devDependencies ?? {}) || name in (pkg.dependencies ?? {}),
    );
    if (deps.length) fail(`package.json still depends on ${deps.join(", ")}`);
    const lock = JSON.parse(
      fs.readFileSync(path.join(releaseDir, "package-lock.json"), "utf8"),
    );
    const locked = TOOLING_DEV_DEPENDENCIES.filter(
      (name) =>
        `node_modules/${name}` in (lock.packages ?? {}) ||
        name in (lock.packages?.[""]?.devDependencies ?? {}),
    );
    if (locked.length) fail(`package-lock.json still has ${locked.join(", ")}`);

    for (const [name, entries] of Object.entries(IGNORE_ENTRIES)) {
      const file = path.join(releaseDir, name);
      if (!fs.existsSync(file)) continue;
      const left = fs
        .readFileSync(file, "utf8")
        .split("\n")
        .find((line) => entries.includes(line.trim()));
      if (left) fail(`${name} still has ${left.trim()}`);
    }
    for (const [name, key, entries] of CONFIG_ARRAYS) {
      const file = path.join(releaseDir, name);
      if (!fs.existsSync(file)) continue;
      const config = parseJsonc(fs.readFileSync(file, "utf8"));
      const left = (config[key] ?? []).find((value) => entries.includes(value));
      if (left) fail(`${name} ${key} still has ${left}`);
    }
    return `${files.length} tracked files, none under ${EXCLUDED_PREFIXES.join(" ")}; no one-off script, devDependency or ignore entry`;
  });

  step("(b) mentions", () => {
    const files = lsFiles(releaseDir);
    const hits = [];
    for (const file of files) {
      const lines = [
        file,
        ...fs.readFileSync(path.join(releaseDir, file), "utf8").split("\n"),
      ];
      lines.forEach((text, index) => {
        for (const [name, pattern] of MENTIONS) {
          if (pattern.test(text))
            hits.push(
              `${file}:${index === 0 ? "(path)" : index} mentions ${name}`,
            );
        }
      });
    }
    if (hits.length) {
      const log = path.join(logDir, "mentions.log");
      fs.writeFileSync(log, `${hits.join("\n")}\n`);
      fail(
        `${hits[0]}${hits.length > 1 ? ` (+${hits.length - 1} more)` : ""}; list: ${log}`,
      );
    }
    return `${files.length} files (paths and contents) searched for ${MENTIONS.length} identifiers, 0 hits`;
  });

  const product = [
    ["(c) npm ci", "npm", ["ci", "--no-audit", "--no-fund"], "npm-ci"],
    ["(c) lint", "npm", ["run", "lint"], "lint"],
    ["(c) typecheck", "npm", ["run", "typecheck"], "typecheck"],
    ["(c) check", "npm", ["run", "check"], "check"],
    ["(c) build", "npm", ["run", "build"], "build"],
    ["(c) prettier", "npx", ["prettier", "--check", "."], "prettier"],
    ["(c) verify:setup", "npm", ["run", "verify:setup"], "verify-setup"],
    ["(c) verify", "npm", ["run", "verify"], "verify"],
  ];
  for (const [name, command, commandArgs, log] of product) {
    step(name, () => {
      run(
        releaseDir,
        `${command} ${commandArgs.join(" ")}`,
        command,
        commandArgs,
        `release-${log}`,
      );
      return `${command} ${commandArgs.join(" ")}`;
    });
  }

  step("(d) checkout", () => {
    compareDir = path.join(state.tmp, "from");
    state.worktrees.push(compareDir);
    git(repo, "worktree", "add", "--quiet", "--detach", compareDir, compareSha);
    return `${compareDir} at ${short(compareSha)}`;
  });
  for (const [name, command, commandArgs, log] of [
    ["(d) npm ci", "npm", ["ci", "--no-audit", "--no-fund"], "npm-ci"],
    ["(d) build", "npm", ["run", "build"], "build"],
  ]) {
    step(name, () => {
      run(
        compareDir,
        `${command} ${commandArgs.join(" ")} (from)`,
        command,
        commandArgs,
        `from-${log}`,
      );
      return `${command} ${commandArgs.join(" ")}`;
    });
  }

  step("(d) dist", () => {
    const countFiles = (dir) =>
      fs
        .readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile()).length;
    const releaseDist = path.join(releaseDir, "dist");
    const compareDist = path.join(compareDir, "dist");
    const files = countFiles(releaseDist);
    if (files === 0) fail("the release build wrote no files to dist/");
    const log = path.join(logDir, "dist.diff");
    const fd = fs.openSync(log, "w");
    const diff = spawnSync("diff", ["-r", releaseDist, compareDist], {
      stdio: ["ignore", fd, fd],
    });
    fs.closeSync(fd);
    if (diff.status === 1) {
      const differing = fs
        .readFileSync(log, "utf8")
        .split("\n")
        .filter((line) => /^(diff -r |Only in |Binary files )/.test(line));
      fail(
        `dist/ differs from a build of ${short(compareSha)}: ${differing.length} file(s) (${files} vs ${countFiles(compareDist)} files); diff: ${log}`,
      );
    }
    if (diff.status !== 0) fail(`diff -r exited with ${diff.status}`);
    report.dist = files;
    return `${files} files byte-identical to a build of ${short(compareSha)} (diff -r)`;
  });

  step("commit", () => {
    // The product commands must not have touched tracked files or left files .gitignore misses.
    const left = [
      ...git(releaseDir, "diff", "--name-only").split("\n"),
      ...git(releaseDir, "ls-files", "--others", "--exclude-standard").split(
        "\n",
      ),
    ].filter(Boolean);
    if (left.length)
      fail(
        `the product commands changed the release tree (${left.length} path(s), e.g. ${left[0]})`,
      );
    if (gitOk(releaseDir, "diff", "--cached", "--quiet", baseSha))
      fail("the release tree is identical to origin/main; nothing to release");
    // --no-verify: the pre-commit hook runs oxlint and Prettier on staged files; (c) already ran
    // both on the whole tree.
    git(
      releaseDir,
      "commit",
      "--quiet",
      "--no-verify",
      "-m",
      args.message,
      "-m",
      TRAILER,
    );
    commitSha = git(releaseDir, "rev-parse", "HEAD").trim();
    return `${commitSha} ${args.message}`;
  });

  step("diff", () => {
    const stat = git(
      repo,
      "diff",
      "--shortstat",
      `refs/remotes/origin/main...${args.branch}`,
    ).trim();
    return `origin/main...${args.branch}: ${stat}`;
  });

  const top = git(repo, "ls-tree", "--name-only", commitSha)
    .split("\n")
    .filter(Boolean);
  say("", "top-level", `${top.length}: ${top.join(" ")}`);

  state.keepBranch = !args.dryRun;
}

let failed = false;
try {
  main();
} catch (error) {
  failed = true;
  if (!(error instanceof Failure && error.cause === "reported"))
    say("FAIL", "release", `${error?.message ?? error}`);
} finally {
  cleanup();
}

const hasLogs = Boolean(logDir) && fs.readdirSync(logDir).length > 0;
if (failed) {
  if (logDir && !hasLogs) fs.rmSync(logDir, { recursive: true, force: true });
  console.log(`FAIL  ${elapsed(started)}${hasLogs ? `  logs: ${logDir}` : ""}`);
  process.exit(1);
}
fs.rmSync(logDir, { recursive: true, force: true });
console.log(
  `done  ${elapsed(started)}  ${args.branch} ${short(commitSha)}${args.dryRun ? " (dry run: branch deleted)" : " (not pushed)"}`,
);
