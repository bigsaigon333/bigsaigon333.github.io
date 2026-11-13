// Command-level cases of the self-test (`npm run verify:selftest -- --only=cli`).
//
// The mutations of a check prove that the check notices a difference. These prove that the commands around
// the checks cannot be made to pass by asking for nothing or by building from leftovers, that accept files accept
// only what they declare and only for the baseline they were written for, that the build refuses front matter the
// schema does not describe, and that the gate
// of pull requests and deploys (`verify --feature`) needs no baseline (both on a copy of the project, so that no
// fixture is ever written into posts/), and that a reporter module (VERIFY_REPORTER) gets one summary of a run and
// cannot change its exit status. Each case runs a command the way it is typed and returns null, or what went wrong.
//
// None of them asks whether the current build still equals the baseline: that is what the parity run answers, and
// CI runs these cases on pull requests whose build differs from the baseline by design (a new post).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

import {
  baselineDir,
  distDir,
  mainRoot,
  reportDir,
  repoRoot,
} from "./paths.mjs";
import { baselineHash } from "./accept.mjs";
import { listRoutes } from "./resolve.mjs";
import { loadChecks, readsBaseline, runChecks } from "./runner.mjs";

const RESULT_LINE = /^(PASS|FAIL|ALL PASS|FAILED|SELFTEST)\b/;
const script = (name) => path.join(repoRoot, "scripts", "verify", name);
const firstLine = (text) => text.trim().split("\n")[0] ?? "";

/** `env` is added to the environment. Without it the run has no reporter: these runs test the commands, they are not real runs. */
function command(name, flags, env = {}) {
  const run = spawnSync(process.execPath, [script(name), ...flags], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, VERIFY_REPORTER: "off", ...env },
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  return {
    status: run.status,
    output,
    lines: output.split("\n").filter(Boolean),
  };
}

/** The command line must be refused before anything runs: exit status 2, the reason given, no result line. */
function refused(name, flags, reason) {
  const { status, output, lines } = command(name, flags);
  if (status !== 2)
    return `exit status ${status}, expected 2: ${firstLine(output)}`;
  if (!reason.test(output))
    return `the message does not say ${reason}: ${firstLine(output)}`;
  if (lines.some((line) => RESULT_LINE.test(line)))
    return "something ran before the command line was refused";
  return null;
}

// ── a build that renders from scratch ───────────────────────────────────────────────────────────

const STORE = path.join(repoRoot, "node_modules", ".astro", "data-store.json");
const MARKER = "STALE-STORE-MARKER";
// The store keeps the rendered HTML of every post as a JSON string in which "<" is written <.
const STORED_PARAGRAPH = "\\u003Cp>";

const astro = (...flags) =>
  spawnSync("npx", ["astro", ...flags], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
  });

const pagesWithMarker = () =>
  fs
    .readdirSync(distDir, { recursive: true })
    .filter(
      (name) =>
        name.endsWith(".html") &&
        fs.readFileSync(path.join(distDir, name), "utf8").includes(MARKER),
    );

/**
 * Astro keeps the HTML it rendered for each post in node_modules/.astro/data-store.json and a plain
 * `astro build` reuses it for posts whose source has not changed, whatever has happened to the packages that
 * rendered it. Here one stored paragraph is given a marker; a gate that builds from scratch never shows it.
 *
 * The gate is run as the workflows run it (`--feature`), with a check that only reads the build: its exit status
 * then says whether the build went through, not whether this build still equals the deployed site. A pull request
 * that adds a post changes the home page, and a parity check would fail this case for that alone. Both modes
 * build with the same step.
 */
function staleStore() {
  if (!fs.existsSync(STORE)) astro("build"); // a first build writes the store
  if (!fs.existsSync(STORE)) return `no content store at ${STORE}`;

  const original = fs.readFileSync(STORE, "utf8");
  if (!original.includes(STORED_PARAGRAPH))
    return "the content store holds no rendered paragraph to tamper with: has its format changed?";
  fs.writeFileSync(
    STORE,
    original.replaceAll(STORED_PARAGRAPH, `${STORED_PARAGRAPH}${MARKER} `),
  );

  let problem = null;
  try {
    // The hazard has to be real for the rest to mean anything: a plain build does publish the marker.
    astro("build");
    if (pagesWithMarker().length === 0)
      return "a plain `astro build` did not reuse the tampered store entry, so this case proves nothing any more: has Astro's content cache changed?";

    const { status, output } = command("run.mjs", [
      "--feature",
      "--only=listed",
      "--no-check",
    ]);
    const stale = pagesWithMarker();
    if (stale.length)
      problem = `the gate built ${stale[0]} from the HTML left in the content store`;
    else if (status !== 0)
      problem = `exit status ${status}: ${firstLine(output)}`;
    else if (fs.readFileSync(STORE, "utf8").includes(MARKER))
      problem = "the build left the tampered entry in the content store";
  } finally {
    // Never leave the marker behind: not in the store, where the next plain build would pick it up, nor in dist/.
    if (fs.readFileSync(STORE, "utf8").includes(MARKER)) {
      fs.writeFileSync(STORE, original);
      astro("build", "--force");
    }
  }
  return problem;
}

// ── the deployed site is the baseline ───────────────────────────────────────────────────────────

/**
 * `verify:live --serve=<dir> <flags>`: exit status and failing checks. After a deploy the baseline is the commit
 * just deployed, so the site served must answer like the baseline in every respect.
 */
function rehearsal(dir, expected, flags = []) {
  const { status, output, lines } = command("live.mjs", [
    `--serve=${dir}`,
    ...flags,
  ]);
  const failing = lines
    .filter((line) => /^FAIL\s/.test(line)) // a check's line, not the "FAILED 4/5 checks" summary
    .map((line) => line.split(/\s+/)[1]);
  if (
    status !== expected.status ||
    failing.join(",") !== expected.failing.join(",")
  )
    return `exit status ${status}, failing checks: ${failing.join(", ") || "none"} — expected ${expected.status}, failing: ${expected.failing.join(", ") || "none"}: ${firstLine(output)}`;
  return null;
}

// ── the front-matter schema, on a copy of the project ───────────────────────────────────────────
//
// src/content.config.ts takes only the keys it knows and only a quoted date. Proving that takes a post the schema
// rejects, and posts/ is no place for one: a post left there stops every build. So the posts are written into a
// copy of the project outside the repository, and the copy is built.

/** What `astro build` reads besides the posts and node_modules. */
const BUILD_INPUTS = [
  "astro.config.mjs",
  "config",
  "integrations",
  "src",
  "public",
  "tsconfig.json",
  "package.json",
];
/** What Astro and Vite write under node_modules/. A copy starts without them and keeps its own. */
const NODE_MODULES_CACHES = new Set([".astro", ".vite", ".cache"]);
/**
 * Packages copied into the copy instead of linked. Astro compiles the .astro components it ships (ClientRouter)
 * and looks up their compile metadata under the copy's root joined with the link's real path, which a link to
 * the repository's node_modules/astro makes a path that does not exist.
 */
const NODE_MODULES_COPIED = new Set(["astro"]);
const BUILD_TIMEOUT_MS = 180_000;

const isInside = (dir, root) => {
  const relative = path.relative(root, dir);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

/**
 * Fill `dir` with what a build reads: BUILD_INPUTS, the top-level posts (not posts/draft/, which the loader does
 * not read) and `posts` ({ "<file name>": "<content>" }). node_modules is a directory of links to the
 * repository's packages (NODE_MODULES_COPIED copied instead), not one link to the directory, so that the content
 * store Astro writes to node_modules/.astro stays in the copy. Throws when anything is missing.
 */
function fillCopy(dir, posts) {
  if (isInside(dir, fs.realpathSync(repoRoot)))
    throw new Error(`${dir} is inside the repository`);
  for (const name of BUILD_INPUTS)
    fs.cpSync(path.join(repoRoot, name), path.join(dir, name), {
      recursive: true,
    });

  fs.mkdirSync(path.join(dir, "posts"));
  for (const entry of fs.readdirSync(path.join(repoRoot, "posts"), {
    withFileTypes: true,
  }))
    if (entry.isFile() && entry.name.endsWith(".md"))
      fs.copyFileSync(
        path.join(repoRoot, "posts", entry.name),
        path.join(dir, "posts", entry.name),
      );
  for (const [name, content] of Object.entries(posts))
    fs.writeFileSync(path.join(dir, "posts", name), content);

  fs.mkdirSync(path.join(dir, "node_modules"));
  for (const entry of fs.readdirSync(path.join(repoRoot, "node_modules")))
    if (NODE_MODULES_COPIED.has(entry))
      fs.cpSync(
        path.join(repoRoot, "node_modules", entry),
        path.join(dir, "node_modules", entry),
        { recursive: true },
      );
    else if (!NODE_MODULES_CACHES.has(entry))
      fs.symlinkSync(
        path.join(repoRoot, "node_modules", entry),
        path.join(dir, "node_modules", entry),
      );
  if (!fs.existsSync(path.join(dir, "node_modules", ".bin", "astro")))
    throw new Error(
      "node_modules/.bin/astro is missing — run `npm run verify:setup`",
    );
}

/**
 * Run `use(dir)` on a fresh copy of the project with `posts` added, and remove the copy afterwards, also when
 * `use` throws. A copy that cannot be made is the case's failure, not a skipped case.
 */
function withCopy(posts, use) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "verify-frontmatter-")),
  );
  try {
    try {
      fillCopy(dir, posts);
    } catch (error) {
      return `could not copy the project: ${String(error?.message ?? error).split("\n")[0]}`;
    }
    return use(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** `astro build --force` in the copy, as the gate builds. The output without colour codes. */
function buildCopy(dir) {
  const run = spawnSync(
    process.execPath,
    [path.join(dir, "node_modules", ".bin", "astro"), "build", "--force"],
    {
      cwd: dir,
      encoding: "utf8",
      timeout: BUILD_TIMEOUT_MS,
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", FORCE_COLOR: "0" },
    },
  );
  return {
    status: run.status,
    output: stripVTControlCharacters(
      `${run.stdout ?? ""}${run.stderr ?? ""}${run.error ? `\n${run.error.message}` : ""}`,
    ),
  };
}

/** The line of a build's output worth quoting: the first that says "error", else the last before a stack trace. */
const saidByBuild = (output) => {
  const lines = output.split("\n").filter((line) => line.trim());
  const stack = lines.findIndex((line) =>
    /^\s*(?:Stack trace:$|at\s)/.test(line),
  );
  return (
    lines.find((line) => /error\b/i.test(line)) ??
    lines.slice(0, stack === -1 ? undefined : stack).at(-1) ??
    ""
  )
    .trim()
    .slice(0, 160);
};

/** A post the schema takes. `extra` is more front matter, one "key: value" per line. */
const post = (title, extra = "") =>
  `---\ntitle: "${title}"\ndate: "2024-01-01"\ndescription: "a post the self-test adds to a copy of the project"\nkeywords: "verify, fixture"\n${extra}---\n\n${title} body\n`;

/** A token for a fixture's file name and title that no real post contains. */
const fixtureToken = () => `verify-fixture-${randomBytes(4).toString("hex")}`;

/** The copy's dist/ has a page for posts/<id>.md showing `title`, lists it on the home page and in the sitemap. */
function published(dir, id, title) {
  const dist = path.join(dir, "dist");
  const page = path.join(dist, "posts", `${id}.html`);
  if (!fs.existsSync(page))
    return `the build passed but made no page for posts/${id}.md`;
  if (!fs.readFileSync(page, "utf8").includes(title))
    return `dist/posts/${id}.html does not show the post's title`;
  if (
    !fs
      .readFileSync(path.join(dist, "index.html"), "utf8")
      .includes(`href="/posts/${id}"`)
  )
    return `the home page does not list posts/${id}.md`;
  if (
    !fs
      .readFileSync(path.join(dist, "sitemap.xml"), "utf8")
      .includes(`/posts/${id}</loc>`)
  )
    return `sitemap.xml does not list posts/${id}.md`;
  return null;
}

/**
 * The build stopped on `file` because of the schema, and said why: the file and `issue`. Asked of the output, not
 * of the exit status alone: a copy that cannot build at all also exits with 1.
 */
function rejected({ status, output }, file, issue) {
  if (status === 0) return `the build accepted posts/${file}`;
  if (!/does not match collection schema/.test(output))
    return `the build failed, but not on the schema (exit status ${status}): ${saidByBuild(output)}`;
  if (!output.includes(`posts/${file}`))
    return `the error does not name the file posts/${file}: ${saidByBuild(output)}`;
  if (!issue.test(output))
    return `the error does not say ${issue}: ${saidByBuild(output)}`;
  return null;
}

/** The control: what the other cases add is a post the copy would otherwise build and publish. */
function validPostIsPublished() {
  const id = fixtureToken();
  return withCopy({ [`${id}.md`]: post(id) }, (dir) => {
    const build = buildCopy(dir);
    if (build.status !== 0)
      return `the copy did not build (exit status ${build.status}): ${saidByBuild(build.output)}`;
    return published(dir, id, id);
  });
}

function misspeltKeyStopsTheBuild() {
  const id = fixtureToken();
  const file = `${id}.md`;
  return withCopy(
    { [file]: post(id, "desciption: typo of description\n") },
    (dir) => rejected(buildCopy(dir), file, /Unrecognized key: "desciption"/),
  );
}

function unquotedDateStopsTheBuild() {
  const id = fixtureToken();
  const file = `${id}.md`;
  const unquoted = post(id).replace('date: "2024-01-01"', "date: 2024-01-01");
  // The issue is reported at the key. Astro writes "**date**: <message>" and its error formatter makes the part
  // between the asterisks bold, so the output has "date: <message>"; the asterisks are allowed for in case it does not.
  return withCopy({ [file]: unquoted }, (dir) =>
    rejected(buildCopy(dir), file, /^\s*(?:\*\*)?date(?:\*\*)?: /m),
  );
}

/**
 * Both kinds of top-level draft are read by the loader (they are in the copy's content store) and published
 * nowhere: no file of dist/ is named after them or mentions them. A post added beside them is published, so the
 * drafts were written where posts are read.
 */
function draftsHaveNoPage() {
  const control = fixtureToken();
  // Looked for by token, not by id, so that a page under any spelling of "draft:<token>" is found too.
  const prefixed = fixtureToken();
  const flagged = fixtureToken();
  const drafts = [prefixed, flagged];
  const file = {
    [prefixed]: `draft:${prefixed}.md`,
    [flagged]: `${flagged}.md`,
  };
  return withCopy(
    {
      [`${control}.md`]: post(control),
      [file[prefixed]]: post(`draft:${prefixed}`),
      [file[flagged]]: post(flagged, "draft: true\n"),
    },
    (dir) => {
      const build = buildCopy(dir);
      if (build.status !== 0)
        return `the copy with drafts did not build (exit status ${build.status}): ${saidByBuild(build.output)}`;
      const problem = published(dir, control, control);
      if (problem) return `control: ${problem}`;

      const store = path.join(dir, "node_modules", ".astro", "data-store.json");
      if (!fs.existsSync(store))
        return "the copy has no content store, so whether the drafts were read is unknown";
      const stored = fs.readFileSync(store, "utf8");
      const unread = drafts.filter((token) => !stored.includes(token));
      if (unread.length)
        return `the loader did not read ${unread.map((token) => `posts/${file[token]}`).join(", ")}, so no page for it proves nothing`;

      const dist = path.join(dir, "dist");
      for (const name of fs.readdirSync(dist, { recursive: true })) {
        const full = path.join(dist, name);
        if (!fs.statSync(full).isFile()) continue;
        const content = fs.readFileSync(full, "utf8");
        const shown = drafts.find(
          (token) => name.includes(token) || content.includes(token),
        );
        if (shown)
          return `dist/${name} publishes the draft posts/${file[shown]}`;
      }
      return null;
    },
  );
}

/**
 * run.mjs verifies the project it is started in: lib/paths.mjs asks git for the top level of the working
 * directory. This makes a copy such a project: scripts/verify and tools/ (the checker `npm run check` starts)
 * linked in, the drafts of posts/draft/ copied (the drafts check reads them), a git work tree of its own, and the
 * baseline linked in when `baseline` is true. Returns null, or why the copy is not such a project.
 */
function asProject(dir, { baseline }) {
  fs.mkdirSync(path.join(dir, "scripts"));
  fs.symlinkSync(
    path.join(repoRoot, "scripts", "verify"),
    path.join(dir, "scripts", "verify"),
  );
  fs.symlinkSync(path.join(repoRoot, "tools"), path.join(dir, "tools"));
  fs.cpSync(
    path.join(repoRoot, "posts", "draft"),
    path.join(dir, "posts", "draft"),
    { recursive: true },
  );
  if (baseline) {
    fs.mkdirSync(path.join(dir, ".verify"));
    fs.symlinkSync(baselineDir, path.join(dir, ".verify", "baseline"));
  }
  spawnSync("git", ["init", "-q"], { cwd: dir });
  const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: dir,
    encoding: "utf8",
  }).stdout?.trim();
  return top === dir
    ? null
    : `the copy is not a git work tree of its own (top level: ${top || "none"}), so run.mjs would not verify it`;
}

/** `node scripts/verify/run.mjs <flags>` in a copy made by asProject(), as it is typed there. */
function verifyIn(dir, flags) {
  const run = spawnSync(
    process.execPath,
    [path.join("scripts", "verify", "run.mjs"), ...flags],
    {
      cwd: dir,
      encoding: "utf8",
      timeout: BUILD_TIMEOUT_MS,
      env: { ...process.env, VERIFY_REPORTER: "off" },
    },
  );
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}${run.error ? `\n${run.error.message}` : ""}`;
  return {
    status: run.status,
    output,
    lines: output.split("\n").filter(Boolean),
  };
}

/** The checks and steps a run printed a result line for ("PASS  seo  15/15" → "seo"), in order. */
const ranChecks = (lines) =>
  lines
    .map((line) => /^(?:PASS|FAIL)\s+(\S+)\s+\d+\/\d+/.exec(line)?.[1])
    .filter(Boolean);

/** { "<route>": "pass" | "fail" | "skip" } of a copy's .verify/report/<check>.json, or null when it reports none. */
function reportedRoutes(dir, check) {
  const file = path.join(dir, ".verify", "report", `${check}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).cells ?? null;
}

/** Why a run that should have passed did not, in one line. */
const whyFailed = ({ status, lines }) =>
  `exit status ${status}: ${lines.filter((line) => /^FAIL\s/.test(line)).join(" | ") || lines.at(-1) || "no output"}`;

/**
 * The checks of `npm run verify -- --feature` (the ones that never read the baseline) need no baseline: the gate
 * of pull requests and of the deploy workflow, in a checkout without a baseline. The copy has a post
 * the baseline does not have, as an ordinary pull request would add, and nothing at .verify/baseline.
 *   1. `--feature` as the workflows type it passes, runs check, build and exactly those checks, and every check
 *      that reports per route examined the new post's route
 *   2. `--route=<the new post>` narrows those checks to that route: --route picks from the candidate's routes
 *   3. a route the candidate does not have is refused with exit status 2
 */
async function featureWithoutBaseline() {
  const expected = (await loadChecks())
    .filter((check) => !readsBaseline(check))
    .map((check) => check.name);
  const id = fixtureToken();
  const route = `/posts/${id}`;
  return withCopy({ [`${id}.md`]: post(id) }, (dir) => {
    const problem = asProject(dir, { baseline: false });
    if (problem) return problem;

    const full = verifyIn(dir, ["--feature"]);
    if (fs.existsSync(path.join(dir, ".verify", "baseline")))
      return "the run made a baseline in the copy";
    if (!fs.existsSync(path.join(dir, "dist", "posts", `${id}.html`)))
      return `run.mjs did not build the copy: ${firstLine(full.output)}`;
    if (full.status !== 0) return whyFailed(full);
    const ran = ranChecks(full.lines);
    const wanted = ["check", "build", ...expected];
    if (ran.join(",") !== wanted.join(","))
      return `ran ${ran.join(", ")}; expected ${wanted.join(", ")}`;
    const perRoute = expected.filter(
      (check) => reportedRoutes(dir, check) !== null,
    );
    if (perRoute.length === 0)
      return "no check reported per route, so whether the new post was examined is unknown";
    const missed = perRoute.filter(
      (check) => reportedRoutes(dir, check)[route] !== "pass",
    );
    if (missed.length)
      return `${missed.join(", ")} did not examine ${route}, the post only the copy has`;

    const narrowed = verifyIn(dir, [
      "--feature",
      "--no-build",
      "--no-check",
      `--route=${route}`,
    ]);
    if (narrowed.status !== 0)
      return `--route=${route}: ${whyFailed(narrowed)}`;
    for (const check of perRoute) {
      const routes = Object.keys(reportedRoutes(dir, check) ?? {});
      if (routes.join(",") !== route)
        return `--route=${route}: ${check} examined ${routes.join(", ") || "nothing"}`;
    }

    const unknown = `${route}-missing`;
    const refusal = verifyIn(dir, [
      "--feature",
      "--no-build",
      "--no-check",
      `--route=${unknown}`,
    ]);
    if (refusal.status !== 2)
      return `--route=${unknown}: exit status ${refusal.status}, expected 2: ${firstLine(refusal.output)}`;
    if (!refusal.output.includes(`no such route: ${unknown}`))
      return `--route=${unknown}: the message does not say "no such route": ${firstLine(refusal.output)}`;
    if (ranChecks(refusal.lines).length)
      return `--route=${unknown}: checks ran before the route was refused`;
    return null;
  });
}

/** Modification times of the logs the steps of run.mjs write (null: no such log). */
const stepLogs = () =>
  ["check.log", "build.log"].map((name) => {
    try {
      return fs.statSync(path.join(reportDir, name)).mtimeMs;
    } catch {
      return null;
    }
  });

/** Like refused(), and neither `npm run check` nor the build ran: run.mjs prints their lines only at the end. */
function refusedBeforeBuild(flags, reason) {
  const before = stepLogs();
  const problem = refused("run.mjs", flags, reason);
  if (problem) return `${flags.join(" ")}: ${problem}`;
  if (stepLogs().some((stamp, index) => stamp !== before[index]))
    return `${flags.join(" ")}: a step ran before the command line was refused`;
  return null;
}

/**
 * The same kind of copy, with the baseline linked in, whose build fails on a misspelt key. The command is run there
 * as it is typed.
 */
function failedBuildIsReadable() {
  const id = fixtureToken();
  return withCopy(
    { [`${id}.md`]: post(id, "desciption: typo of description\n") },
    (dir) => {
      const problem = asProject(dir, { baseline: true });
      if (problem) return problem;

      const { status, output, lines } = verifyIn(dir, [
        "--no-check",
        "--only=routes",
      ]);
      const log = path.join(dir, ".verify", "report", "build.log");
      if (!fs.existsSync(log) || !fs.readFileSync(log, "utf8").includes(id))
        return `run.mjs did not build the copy: ${firstLine(output)}`;
      const line = lines.find((line) => /^FAIL\s+build\b/.test(line));
      if (!line)
        return `the build did not fail on posts/${id}.md (exit status ${status}): ${lines.at(-1) ?? ""}`;
      if (status !== 1)
        return `exit status ${status}, expected 1: ${firstLine(output)}`;
      if (lines.some((line) => /^(PASS|FAIL)\s+routes\b/.test(line)))
        return "checks ran after the build had failed";
      if (stripVTControlCharacters(line) !== line)
        return `the line carries colour codes: ${JSON.stringify(line)}`;
      for (const wanted of [`posts → ${id}`, 'Unrecognized key: "desciption"'])
        if (!line.includes(wanted))
          return `the line does not show ${JSON.stringify(wanted)}: ${line}`;
      return null;
    },
  );
}

// ── the reporter hook ───────────────────────────────────────────────────────────────────────────

/** The keys of the summary a reporter receives (lib/runner.mjs report()). */
const SUMMARY_KEYS = ["command", "durationMs", "matrix", "ok", "results"];

/**
 * Run `use(dir, module)` with a reporter module written to a fresh directory under the system's temporary directory:
 * `module(name, body)` writes <dir>/<name> with `body` as the module's source and returns its path. The directory is
 * removed afterwards, also when `use` throws.
 */
function withReporters(use) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "verify-reporter-")),
  );
  const module = (name, body) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, body);
    return file;
  };
  try {
    return use(dir, module);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** A reporter that appends every summary it is given to `log`, one JSON line each. */
const recorder = (log) =>
  `import fs from "node:fs";\nexport default (summary) => fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(summary) + "\\n");\n`;

/**
 * `<script> <flags>` with VERIFY_REPORTER=`reporter`: exactly one summary reached it, and it says what ran.
 * `expected` is { status, command, ok, checks, feature }.
 */
function reported(dir, module, script, flags, reporter, expected) {
  const log = path.join(dir, `${expected.command}.jsonl`);
  module(path.basename(reporter), recorder(log));
  const { status, output } = command(script, flags, {
    VERIFY_REPORTER: reporter,
  });
  const said = `${script} ${flags.join(" ")}`;
  if (status !== expected.status)
    return `${said}: exit status ${status}, expected ${expected.status}: ${firstLine(output)}`;
  const lines = fs.existsSync(log)
    ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean)
    : [];
  if (lines.length !== 1)
    return `${said}: the reporter received ${lines.length} summaries, expected 1`;
  const summary = JSON.parse(lines[0]);
  const keys = [...SUMMARY_KEYS, ...(expected.feature ? ["feature"] : [])];
  const got = Object.keys(summary).sort();
  if (got.join(",") !== keys.sort().join(","))
    return `${said}: the summary has ${got.join(", ")}; expected ${keys.join(", ")}`;
  const checks = summary.results.map((result) => result.check);
  const wrong = [
    summary.command !== expected.command &&
      `command ${summary.command}, expected ${expected.command}`,
    summary.ok !== expected.ok && `ok ${summary.ok}, expected ${expected.ok}`,
    expected.feature && summary.feature !== true && "feature is not true",
    checks.join(",") !== expected.checks.join(",") &&
      `checks ${checks.join(", ")}, expected ${expected.checks.join(", ")}`,
    summary.matrix?.checks?.join(",") !== expected.checks.join(",") &&
      `matrix checks ${summary.matrix?.checks?.join(", ")}, expected ${expected.checks.join(", ")}`,
    typeof summary.durationMs !== "number" && "durationMs is not a number",
  ].filter(Boolean);
  return wrong.length ? `${said}: ${wrong.join("; ")}` : null;
}

/**
 * The cheapest real runs, one of each outcome: the gate (`--feature`) with a check that only reads the build, which
 * passes on any build that went through, and a rehearsal of status against a directory without the site, which
 * fails. The second names its reporter relative to the main checkout.
 */
function reporterGetsOneSummary() {
  return withReporters(
    (dir, module) =>
      reported(
        dir,
        module,
        "run.mjs",
        ["--feature", "--no-build", "--no-check", "--only=listed"],
        path.join(dir, "verify.mjs"),
        {
          status: 0,
          command: "verify",
          ok: true,
          checks: ["listed"],
          feature: true,
        },
      ) ??
      // A directory without the site: nothing of the baseline answers 200.
      reported(
        dir,
        module,
        "live.mjs",
        [`--serve=${dir}`, "--only=status"],
        path.relative(mainRoot, path.join(dir, "live.mjs")),
        { status: 1, command: "live", ok: false, checks: ["status"] },
      ),
  );
}

/** A reporter that throws, or that cannot be loaded, costs one line on stderr and leaves the exit status alone. */
function brokenReporterKeepsTheStatus() {
  return withReporters((dir, module) => {
    const flags = ["--feature", "--no-build", "--no-check", "--only=listed"];
    const reason = `reporter-failure-${randomBytes(4).toString("hex")}`;
    for (const [reporter, says] of [
      [
        module(
          "throws.mjs",
          `export default () => {\n  throw new Error(${JSON.stringify(reason)});\n};\n`,
        ),
        reason,
      ],
      [path.join(dir, "missing.mjs"), "missing.mjs"],
    ]) {
      const { status, output, lines } = command("run.mjs", flags, {
        VERIFY_REPORTER: reporter,
      });
      const name = path.basename(reporter);
      if (status !== 0)
        return `${name}: exit status ${status}, expected 0: ${firstLine(output)}`;
      if (!lines.some((line) => /^ALL PASS\b/.test(line)))
        return `${name}: the run did not pass: ${lines.at(-1) ?? ""}`;
      const complaint = lines.filter((line) =>
        line.startsWith(`verify: reporter ${reporter} failed: `),
      );
      if (complaint.length !== 1 || !complaint[0].includes(says))
        return `${name}: expected one line "verify: reporter ${reporter} failed: …${says}…", got ${complaint.length}`;
    }
    return null;
  });
}

// ── accept files ────────────────────────────────────────────────────────────────────────────────
//
// Each case writes its accept files to a fresh directory named by VERIFY_ACCEPTED_DIR, never to
// scripts/verify/accepted, and verifies a mutated copy of the baseline as --candidate (nothing is built).

/** Run `use(dir)` on a fresh copy of the baseline mutated by `mutate(dir)`; the copy is removed afterwards. */
function withMutant(mutate, use) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "verify-mutant-")),
  );
  try {
    fs.cpSync(baselineDir, dir, { recursive: true });
    mutate(dir);
    return use(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Replace the text of <dir>/<rel> by `edit(text)`; throws when that changes nothing. */
function editFile(dir, rel, edit) {
  const file = path.join(dir, rel);
  const before = fs.readFileSync(file, "utf8");
  const after = edit(before);
  if (after === before) throw new Error(`the edit changed nothing in ${rel}`);
  fs.writeFileSync(file, after);
}

/** Run `use(acceptDir)` with a fresh directory for accept files; removed afterwards. */
function withAcceptDir(use) {
  const dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "verify-accepted-")),
  );
  try {
    return use(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const writeJson = (file, data) =>
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);

/** `run.mjs --candidate=<dir> <flags>` with the accept files of `acceptDir`. */
const verifyCandidate = (dir, acceptDir, flags) =>
  command("run.mjs", [`--candidate=${dir}`, ...flags], {
    VERIFY_ACCEPTED_DIR: acceptDir,
  });

/** The result line of `check` ("ACCEPT  content   13/14  1 accepted"), or undefined. */
const lineOf = (lines, check) =>
  lines.find((line) => new RegExp(`^\\S+\\s+${check}\\s+\\d+/\\d+`).test(line));

/** A post of the baseline whose body has a paragraph, and the mutation that drops it. */
function dropParagraph(dir) {
  const route = aPost();
  editFile(dir, `${route.slice(1)}.html`, (html) =>
    html.replace(/(<main[^>]*>[\s\S]*?)<p>[\s\S]*?<\/p>/, "$1"),
  );
  return route;
}

function writeAcceptNeedsReason() {
  return withAcceptDir((acceptDir) => {
    for (const [flags, reason] of [
      [["--write-accept=x"], /--write-accept needs --reason/],
      [["--write-accept=x", "--reason="], /--reason needs a value/],
      [["--reason=why"], /--reason goes with --write-accept/],
      [
        ["--feature", "--write-accept=x", "--reason=why"],
        /not with --feature: --write-accept/,
      ],
    ]) {
      const before = stepLogs();
      const { status, output, lines } = command("run.mjs", flags, {
        VERIFY_ACCEPTED_DIR: acceptDir,
      });
      const said = flags.join(" ");
      if (status !== 2)
        return `${said}: exit status ${status}, expected 2: ${firstLine(output)}`;
      if (!reason.test(output))
        return `${said}: the message does not say ${reason}: ${firstLine(output)}`;
      if (lines.some((line) => RESULT_LINE.test(line)))
        return `${said}: something ran before the command line was refused`;
      if (stepLogs().some((stamp, index) => stamp !== before[index]))
        return `${said}: a step ran before the command line was refused`;
      if (fs.readdirSync(acceptDir).length)
        return `${said}: wrote ${fs.readdirSync(acceptDir).join(", ")}`;
    }
    return null;
  });
}

function acceptFileApplies() {
  let route;
  return withMutant(
    (dir) => {
      route = dropParagraph(dir);
    },
    (dir) =>
      withAcceptDir((acceptDir) => {
        // Without an accept file the difference fails.
        const plain = verifyCandidate(dir, acceptDir, ["--only=content"]);
        if (
          plain.status !== 1 ||
          !/^FAIL\s/.test(lineOf(plain.lines, "content") ?? "")
        )
          return `without an accept file: exit status ${plain.status}, expected 1 and FAIL content: ${plain.lines.at(-1)}`;

        const written = verifyCandidate(dir, acceptDir, [
          "--only=content",
          "--write-accept=dropped",
          "--reason=self-test",
        ]);
        const file = path.join(acceptDir, "dropped.json");
        if (!fs.existsSync(file))
          return `--write-accept wrote nothing: ${written.lines.at(-1)}`;
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        const hash = baselineHash(baselineDir);
        if (data.baseline !== hash)
          return `the file was written for baseline ${data.baseline}, not ${hash}`;
        const entries = JSON.stringify(data.entries);
        const wanted = JSON.stringify([
          { check: "content", routes: [route], reason: "self-test" },
        ]);
        if (entries !== wanted) return `entries ${entries}, expected ${wanted}`;

        const accepted = verifyCandidate(dir, acceptDir, ["--only=content"]);
        const line = lineOf(accepted.lines, "content") ?? "";
        if (accepted.status !== 0)
          return `with the accept file: exit status ${accepted.status}, expected 0: ${line}`;
        if (!/^ACCEPT\s+content\s+\d+\/\d+\s+1 accepted/.test(line))
          return `with the accept file the line is not ACCEPT with its count: ${line}`;
        if (
          accepted.lines.some((text) =>
            /unused accept entry|stale accept file/.test(text),
          )
        )
          return "the applied file was reported as unused or stale";

        // It accepts that route only: another difference still fails.
        editFile(dir, "index.html", (html) =>
          html.replace(/(<\/header>[\s\S]*?<h2[^>]*>)/, "$1!"),
        );
        const more = verifyCandidate(dir, acceptDir, ["--only=content"]);
        if (more.status !== 1)
          return `a difference on / was accepted too: exit status ${more.status}: ${lineOf(more.lines, "content")}`;
        return null;
      }),
  );
}

function staleAcceptFileIgnored() {
  let route;
  return withMutant(
    (dir) => {
      route = dropParagraph(dir);
    },
    (dir) =>
      withAcceptDir((acceptDir) => {
        writeJson(path.join(acceptDir, "old.json"), {
          baseline: "0".repeat(64),
          reason: "written for another baseline",
          entries: [{ check: "content", routes: [route], reason: "old" }],
        });
        const { status, lines } = verifyCandidate(dir, acceptDir, [
          "--only=content",
        ]);
        if (status !== 1)
          return `exit status ${status}, expected 1: the stale file was applied: ${lineOf(lines, "content")}`;
        const notices = lines.filter((line) =>
          line.includes("stale accept file ignored: old.json"),
        );
        if (notices.length !== 1)
          return `expected one line "stale accept file ignored: old.json …", got ${notices.length}`;
        return null;
      }),
  );
}

function unusedAcceptEntry() {
  return withAcceptDir((acceptDir) => {
    writeJson(path.join(acceptDir, "unused.json"), {
      baseline: baselineHash(baselineDir),
      reason: "accepts a difference that is not there",
      entries: [{ check: "content", routes: ["/"], reason: "nothing differs" }],
    });
    const { status, lines } = verifyCandidate(baselineDir, acceptDir, [
      "--only=content",
      "--route=/",
    ]);
    if (status !== 0)
      return `exit status ${status}, expected 0: an unused entry is a warning: ${lines.at(-1)}`;
    if (!/^PASS\s/.test(lineOf(lines, "content") ?? ""))
      return `content is not PASS: ${lineOf(lines, "content")}`;
    if (
      !lines.some((line) =>
        /^WARN\s+unused accept entry: unused\.json content \//.test(line),
      )
    )
      return 'no line "WARN  unused accept entry: unused.json content /"';
    return null;
  });
}

/**
 * The same mask over the site header, once with a change inside the header (hidden: PASS, the entry used) and
 * once with a change in the post list below it (caught: FAIL).
 */
function maskHidesOnlyInside() {
  const color = (pattern) => (dir) =>
    editFile(dir, "index.html", (html) =>
      html.replace(pattern, '$1 style="color:#d00"'),
    );
  const mask = {
    baseline: baselineHash(baselineDir),
    reason: "self-test",
    entries: [
      { check: "visual", routes: ["/"], reason: "header", mask: ["header"] },
    ],
  };
  const flags = ["--only=visual", "--route=/"];
  return withAcceptDir((acceptDir) => {
    writeJson(path.join(acceptDir, "mask.json"), mask);
    const inside = withMutant(
      color(/(<header[^>]*>[\s\S]*?<span\b)/),
      (dir) => {
        const plain = command("run.mjs", [`--candidate=${dir}`, ...flags], {
          VERIFY_ACCEPTED_DIR: path.join(acceptDir, "none"),
        });
        if (plain.status !== 1)
          return `inside, without the mask: exit status ${plain.status}, expected 1 (the change is not visible): ${lineOf(plain.lines, "visual")}`;
        const masked = verifyCandidate(dir, acceptDir, flags);
        if (
          masked.status !== 0 ||
          !/^PASS\s/.test(lineOf(masked.lines, "visual") ?? "")
        )
          return `inside the mask: exit status ${masked.status}, expected 0 and PASS: ${lineOf(masked.lines, "visual")}`;
        if (masked.lines.some((line) => line.includes("unused accept entry")))
          return "inside the mask: the mask was reported unused";
        return null;
      },
    );
    if (inside) return inside;
    return withMutant(color(/(<\/header>[\s\S]*?<h2\b)/), (dir) => {
      const outside = verifyCandidate(dir, acceptDir, flags);
      if (
        outside.status !== 1 ||
        !/^FAIL\s/.test(lineOf(outside.lines, "visual") ?? "")
      )
        return `outside the mask: exit status ${outside.status}, expected 1 and FAIL: ${lineOf(outside.lines, "visual")}`;
      return null;
    });
  });
}

// ── selftest shards ─────────────────────────────────────────────────────────────────────────────

/**
 * CI runs the self-test as n jobs (`--shard=<i>/<n>`). The shards together must be the whole self-test: every case
 * of the unsharded list in exactly one shard, nothing else. Compared on the case ids `--list` prints.
 */
function shardsCoverEveryCaseOnce() {
  const list = (flags) => {
    const { status, output, lines } = command("selftest.mjs", [
      "--list",
      ...flags,
    ]);
    if (status !== 0)
      throw new Error(
        `--list ${flags.join(" ")}: exit status ${status}: ${firstLine(output)}`,
      );
    return lines;
  };
  const all = list([]);
  if (all.length === 0) return "--list printed no cases";
  if (new Set(all).size !== all.length) return "--list printed a case twice";
  for (const count of [1, 3, 5]) {
    const seen = new Map();
    for (let index = 1; index <= count; index++) {
      const part = list([`--shard=${index}/${count}`]);
      if (count <= all.length && part.length === 0)
        return `shard ${index}/${count} is empty`;
      for (const id of part) {
        if (seen.has(id))
          return `${id} is in shard ${seen.get(id)}/${count} and ${index}/${count}`;
        seen.set(id, index);
      }
    }
    const missing = all.filter((id) => !seen.has(id));
    if (missing.length) return `no shard of ${count} runs ${missing[0]}`;
    const extra = [...seen.keys()].filter((id) => !all.includes(id));
    if (extra.length)
      return `a shard of ${count} runs ${extra[0]}, which the unsharded list does not have`;
  }
  return (
    refused("selftest.mjs", ["--shard=0/3"], /--shard=0\/3: expected/) ??
    refused("selftest.mjs", ["--shard=4/3"], /--shard=4\/3: expected/) ??
    refused("selftest.mjs", ["--shard=1"], /--shard=1: expected/) ??
    refused("selftest.mjs", ["--shard"], /--shard needs a value/)
  );
}

// ── the cases ───────────────────────────────────────────────────────────────────────────────────

const aPost = () =>
  listRoutes(baselineDir).find((route) => route.startsWith("/posts/")) ??
  "/404";

export const cliCases = [
  {
    name: "verify: 저장소에 남은 렌더 결과를 쓰지 않고 처음부터 빌드한다",
    run: staleStore,
  },
  {
    name: "verify: 앞 슬래시를 빠뜨린 라우트는 빌드 전에 거부한다",
    run: () => {
      const route = aPost().slice(1);
      return refused(
        "run.mjs",
        [`--route=${route}`],
        new RegExp(`no such route: ${route} \\(did you mean /${route}\\?\\)`),
      );
    },
  },
  {
    name: "verify: 없는 검사 이름은 빌드 전에 거부한다",
    run: () => refused("run.mjs", ["--only=haed"], /no such check: haed/),
  },
  {
    name: "verify: 모르는 플래그는 거부한다",
    run: () =>
      refused("run.mjs", ["--no-biuld"], /unknown argument: --no-biuld/),
  },
  {
    name: "verify: 값이 빠진 플래그와 값이 붙은 스위치는 거부한다",
    run: () =>
      refused("run.mjs", ["--only="], /--only needs a value/) ??
      refused("run.mjs", ["--static=yes"], /--static takes no value/),
  },
  {
    name: "verify --feature: 기준선과 비교하는 검사·플래그나 잘못 쓴 라우트를 주면 빌드 전에 거부한다",
    run: () =>
      refusedBeforeBuild(
        ["--feature", "--only=content"],
        /not with --feature: content compares/,
      ) ??
      refusedBeforeBuild(
        ["--feature", "--only=links,routes"],
        /not with --feature: routes compares/,
      ) ??
      refusedBeforeBuild(
        ["--feature", "--selector=header"],
        /not with --feature: --selector/,
      ) ??
      refusedBeforeBuild(
        ["--feature", "--candidate-url=http://127.0.0.1:9"],
        /not with --feature: --candidate-url/,
      ) ??
      refusedBeforeBuild(
        ["--feature", `--route=${aPost().slice(1)}`],
        new RegExp(
          `no such route: ${aPost().slice(1)} \\(did you mean ${aPost()}\\?\\)`,
        ),
      ),
  },
  {
    name: "verify --feature: 기준선 없는 사본에서 새 글까지 보고 통과하며, --route 는 후보의 라우트에서 고른다",
    run: featureWithoutBaseline,
  },
  {
    name: "verify: 이름으로 고른 검사가 --static 에 걸러지면 거부한다",
    run: () =>
      refused(
        "run.mjs",
        ["--static", "--only=visual"],
        /nothing to run for visual/,
      ) ??
      refused(
        "run.mjs",
        ["--static", "--only=head,visual"],
        /nothing to run for visual/,
      ),
  },
  {
    name: "verify: 없어진 플래그(scope, stage, agent)는 모르는 플래그로 거부한다(세 명령 모두)",
    run: () => {
      const gone = [
        ["run.mjs", "scope", "integration"],
        ["run.mjs", "stage", "x"],
        ["run.mjs", "agent", "x"],
        ["selftest.mjs", "stage", "x"],
        ["selftest.mjs", "agent", "x"],
        ["live.mjs", "stage", "x"],
        ["live.mjs", "agent", "x"],
      ];
      for (const [name, flag, value] of gone) {
        const raw = `--${flag}=${value}`;
        const problem = refused(
          name,
          [raw],
          new RegExp(`unknown argument: ${raw}`),
        );
        if (problem) return `${name} ${raw}: ${problem}`;
      }
      return null;
    },
  },
  {
    name: "verify, verify:live: VERIFY_REPORTER 의 모듈이 실행마다 요약을 한 번 받는다(명령, 통과 여부, 검사 이름)",
    run: reporterGetsOneSummary,
  },
  {
    name: "verify: reporter 가 예외를 던지거나 없어도 종료 코드는 그대로이고, stderr 에 한 줄만 남는다",
    run: brokenReporterKeepsTheStatus,
  },
  {
    name: "verify: 아무것도 보지 않은 검사는 통과가 아니다",
    run: async () => {
      const examinedNothing = {
        name: "nothing",
        kind: "static",
        run: async () => ({ ok: true, pass: 0, fail: 0, failed: [] }),
      };
      const [result] = await runChecks({ routes: [], report() {} }, [
        examinedNothing,
      ]);
      if (result.ok) return "a check that passed 0 of 0 items was a pass";
      if (!/nothing was examined/.test(result.failed[0]?.detail ?? ""))
        return `the failure does not say why: ${result.failed[0]?.detail}`;
      return null;
    },
  },
  {
    name: "verify:selftest: 없는 검사 이름과 모르는 플래그는 거부한다",
    run: () =>
      refused("selftest.mjs", ["--only=haed"], /no such check: haed/) ??
      refused("selftest.mjs", ["--no-build"], /unknown argument: --no-build/),
  },
  {
    name: "verify:selftest: --shard 의 조각들을 합치면 나누지 않은 사례 목록과 같고 겹치지 않는다",
    run: shardsCoverEveryCaseOnce,
  },
  {
    name: "verify:live: 없는 검사 이름·라우트와 모르는 플래그는 거부한다",
    run: () =>
      refused(
        "live.mjs",
        [`--serve=${distDir}`, "--only=haed"],
        /no such check: haed/,
      ) ??
      refused(
        "live.mjs",
        [`--serve=${distDir}`, "--route=404"],
        /no such route: 404 \(did you mean \/404\?\)/,
      ) ??
      refused(
        "live.mjs",
        [`--serve=${distDir}`, "--static"],
        /unknown argument: --static/,
      ),
  },
  {
    name: "verify:live: 기준선을 서빙하면 모든 검사를 통과한다",
    run: () => rehearsal(baselineDir, { status: 0, failing: [] }),
  },
  {
    name: "verify:live: 기준선과 <title> 이 다른 사이트는 통과시키지 않는다",
    run: () =>
      withMutant(
        (dir) =>
          editFile(dir, "index.html", (html) =>
            html.replace(/<title>/, "<title>!"),
          ),
        (dir) => rehearsal(dir, { status: 1, failing: ["head"] }),
      ),
  },
  {
    name: "verify --write-accept: --reason 이 없거나 --feature 와 함께면 빌드 전에 거부하고 아무것도 쓰지 않는다",
    run: writeAcceptNeedsReason,
  },
  {
    name: "verify --write-accept: 실패를 accept 파일로 쓰고, 기준선 해시가 맞는 파일은 그 실패를 ACCEPT 로 바꾼다",
    run: acceptFileApplies,
  },
  {
    name: "verify: 기준선 해시가 다른 accept 파일은 한 줄 알리고 무시한다",
    run: staleAcceptFileIgnored,
  },
  {
    name: "verify: 실패와 맞지 않는 accept 항목은 unused 경고만 낸다",
    run: unusedAcceptEntry,
  },
  {
    name: "verify: visual 의 mask 는 가린 요소 안의 변화만 숨기고 밖의 변화는 잡는다",
    run: maskHidesOnlyInside,
  },
  {
    name: "build: (대조군) 프로젝트 사본에 더한 올바른 글은 빌드되어 페이지·홈 목록·sitemap 에 나온다",
    run: validPostIsPublished,
  },
  {
    name: "build: 모르는 front matter 키(desciption)는 빌드를 멈추고, 오류가 키와 파일을 말한다",
    run: misspeltKeyStopsTheBuild,
  },
  {
    name: "build: 따옴표 없는 date 는 빌드를 멈춘다",
    run: unquotedDateStopsTheBuild,
  },
  {
    name: 'build: 최상위의 초안("draft:" 이름, draft: true)은 빌드되지만 어디에도 실리지 않는다',
    run: draftsHaveNoPage,
  },
  {
    name: "verify: 빌드가 실패하면 결과 줄이 로그의 첫 오류(posts → <id>, 문제 줄)를 색 코드 없이 보인다",
    run: failedBuildIsReadable,
  },
];
