// Command-level cases of the self-test (`npm run verify:selftest -- --only=cli`).
//
// The mutations of a check prove that the check notices a difference. These prove that the commands around
// the checks cannot be made to pass by asking for nothing, by building from leftovers or by looking at the
// site that is being replaced, that the build refuses front matter the schema does not describe, and that the gate
// of pull requests and deploys (`verify --feature`) needs no baseline (both on a copy of the project, so that no
// fixture is ever written into posts/). Each case runs a command the way it is typed and returns null, or what
// went wrong.
//
// None of them asks whether the current build still equals the baseline: that is what the parity run answers, and
// CI runs these cases on pull requests whose build differs from the frozen baseline by design (a new post).
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

import { baselineDir, distDir, reportDir, repoRoot } from "./paths.mjs";
import { listRoutes } from "./resolve.mjs";
import { loadChecks, readsBaseline, runChecks, scopeOf } from "./runner.mjs";

const RESULT_LINE = /^(PASS|FAIL|ALL PASS|FAILED|SELFTEST)\b/;
const script = (name) => path.join(repoRoot, "scripts", "verify", name);
const firstLine = (text) => text.trim().split("\n")[0] ?? "";

function command(name, flags) {
  const run = spawnSync(process.execPath, [script(name), ...flags], {
    cwd: repoRoot,
    encoding: "utf8",
    // These runs test the commands; they are not results anybody should see on the dashboard.
    env: { ...process.env, VERIFY_EMIT: "0" },
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
      "--only=migrated",
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

// ── the deployed site is not the new site ───────────────────────────────────────────────────────

/**
 * `verify:live --serve=<dir> <flags>`: exit status and failing checks. The baseline is the site that is being
 * replaced, so it passes every check but migrated. The build is tested with migrated alone: it is the one check
 * that does not compare with the baseline, and whether this build still equals the deployed site is what the parity
 * run (`npm run verify`) answers. Here it would fail every pull request that adds a post.
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
  "src",
  "public",
  "tsconfig.json",
  "package.json",
];
/** What Astro and Vite write under node_modules/. A copy starts without them and keeps its own. */
const NODE_MODULES_CACHES = new Set([".astro", ".vite", ".cache"]);
const BUILD_TIMEOUT_MS = 180_000;

const isInside = (dir, root) => {
  const relative = path.relative(root, dir);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
};

/**
 * Fill `dir` with what a build reads: BUILD_INPUTS, the top-level posts (not posts/draft/, which the loader does
 * not read) and `posts` ({ "<file name>": "<content>" }). node_modules is a directory of links to the
 * repository's packages, not one link to the directory, so that the content store Astro writes to
 * node_modules/.astro stays in the copy. Throws when anything is missing.
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
    if (!NODE_MODULES_CACHES.has(entry))
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
      env: { ...process.env, VERIFY_EMIT: "0" },
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
 * of pull requests and of the deploy workflow, in a checkout that has never fetched gh-pages. The copy has a post
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
    name: "verify: 없는 scope 는 거부하고, 기본 scope 는 local 이다",
    run: () => {
      const typo = refused(
        "run.mjs",
        ["--scope=integratoin"],
        /no such scope: integratoin/,
      );
      if (typo) return typo;
      const expected = [
        [{}, {}, "local"],
        [{ agent: "H1" }, {}, "agent"],
        [{}, { PROGRESS_AGENT: "H1" }, "agent"],
        [{ scope: "integration" }, {}, "integration"],
        [{ scope: "integration", agent: "H1" }, {}, "integration"],
      ];
      for (const [args, env, scope] of expected)
        if (scopeOf(args, env) !== scope)
          return `scope of ${JSON.stringify({ args, env })} is ${scopeOf(args, env)}, expected ${scope}`;
      return null;
    },
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
    name: "verify:live: 예전 배포본(기준선)을 새 사이트로 통과시키지 않는다",
    run: () => rehearsal(baselineDir, { status: 1, failing: ["migrated"] }),
  },
  {
    name: "verify:live: 새 빌드(dist)는 migrated 를 통과한다",
    run: () =>
      rehearsal(distDir, { status: 0, failing: [] }, ["--only=migrated"]),
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
