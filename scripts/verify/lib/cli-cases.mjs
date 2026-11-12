// Command-level cases of the self-test (`npm run verify:selftest -- --only=cli`).
//
// The mutations of a check prove that the check notices a difference. These prove that the commands around
// the checks cannot be made to pass by asking for nothing, by building from leftovers or by looking at the
// site that is being replaced. Each case runs a command the way it is typed and returns null, or what went wrong.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { baselineDir, distDir, repoRoot } from "./paths.mjs";
import { listRoutes } from "./resolve.mjs";
import { runChecks, scopeOf } from "./runner.mjs";

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
      "--only=content",
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

function rehearsal(dir, expected) {
  const { status, output, lines } = command("live.mjs", [`--serve=${dir}`]);
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
    name: "verify:live: 새 빌드(dist)는 통과한다",
    run: () => rehearsal(distDir, { status: 0, failing: [] }),
  },
];
