// npm run verify:build [-- --check]
//
// Builds dist/ as `npm run verify` builds it and records the build in .verify/build.json (lib/build-stamp.mjs), so that
// `npm run verify -- --prebuilt` can check exactly this dist/. CI builds once, checks that build in several jobs and
// deploys the same files. The record is removed first: a failed build leaves none behind.
//
// --check builds nothing: exit 0 when dist/ is the recorded build of the sources checked out now, else 1 with the
// reason. CI runs it right before dist/ becomes the Pages artifact. It needs no node_modules.
import { spawnSync } from "node:child_process";

import {
  BUILD_COMMAND,
  checkStamp,
  removeStamp,
  writeStamp,
} from "./lib/build-stamp.mjs";
import { repoRoot } from "./lib/paths.mjs";

const USAGE = "usage: npm run verify:build [-- --check]";
const flags = process.argv.slice(2);
const unknown = flags.find((flag) => flag !== "--check");
if (unknown) {
  console.error(`unknown argument: ${unknown}\n${USAGE}`);
  process.exit(2);
}

if (flags.includes("--check")) {
  const problem = checkStamp();
  if (problem) {
    console.error(`verify:build --check: ${problem}`);
    process.exit(1);
  }
  console.log("verify:build --check ok  dist/ is the recorded build");
  process.exit(0);
}

removeStamp();
const build = spawnSync(BUILD_COMMAND[0], BUILD_COMMAND.slice(1), {
  cwd: repoRoot,
  stdio: "inherit",
  env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
});
if (build.status !== 0) {
  console.error(
    `verify:build: ${BUILD_COMMAND.join(" ")} failed (${build.error?.message ?? `exit status ${build.status ?? build.signal}`})`,
  );
  process.exit(1);
}
const stamp = writeStamp();
console.log(
  `verify:build ok  commit ${stamp.commit?.slice(0, 12) ?? "none"}  dist ${stamp.dist.slice(0, 12)}`,
);
