// npm run verify [-- --no-build] [-- --only=<demo>[,<demo>]]
//
// Builds the lab, starts the standalone Node server on a free port, runs every case exported by
// verify/<demo>.mjs (files starting with "_" and this file are skipped), prints one line per case
// and ALL PASS or FAILED, and exits 1 when any case fails.
//
// A case file:  export const cases = [{ name, async run({ base, request, browser, dist }) {} }];
//   base     the server's origin, e.g. "http://127.0.0.1:53021"
//   request  (path, init?) => fetch(new URL(path, base), { redirect: "manual", ...init })
//   browser  async () => a Playwright Browser (Chromium), launched once on first call and shared
//   dist     absolute path of dist/ (dist/client = prerendered files, dist/server = the server)
// A case passes when run() resolves and fails when it throws; throw an Error with a useful message.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const argv = process.argv.slice(2);
const noBuild = argv.includes("--no-build");
const only = argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice("--only=".length)
  .split(",")
  .filter(Boolean);
const CASE_TIMEOUT_MS = 30_000;

const env = { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" };

if (!noBuild) {
  const astro = path.join(root, "node_modules", ".bin", "astro");
  const build = spawnSync(astro, ["build"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  if (build.status !== 0) {
    console.log(`${build.stdout}\n${build.stderr}`);
    console.log("FAILED  build");
    process.exit(1);
  }
}

const freePort = () =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [path.join(dist, "server/entry.mjs")], {
  cwd: root,
  env: { ...env, HOST: "127.0.0.1", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (chunk) => (serverLog += chunk));
server.stderr.on("data", (chunk) => (serverLog += chunk));

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) break;
    try {
      await fetch(base, { redirect: "manual" });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`the server did not start on ${base}\n${serverLog}`);
}

let browserPromise;
const browser = () => {
  // Resolved from the repository root's node_modules (npm ci at the root), not a lab dependency.
  browserPromise ??= import("playwright").then(({ chromium }) =>
    chromium.launch(),
  );
  return browserPromise;
};

const request = (pathname, init = {}) =>
  fetch(new URL(pathname, base), { redirect: "manual", ...init });

const files = fs
  .readdirSync(import.meta.dirname)
  .filter((name) => name.endsWith(".mjs") && name !== "run.mjs")
  .filter((name) => !name.startsWith("_"))
  .filter((name) => !only || only.includes(name.replace(/\.mjs$/, "")))
  .sort();

let passed = 0;
let failed = 0;
try {
  await waitForServer();
  for (const file of files) {
    const demo = file.replace(/\.mjs$/, "");
    const { cases = [] } = await import(
      pathToFileURL(path.join(import.meta.dirname, file)).href
    );
    for (const { name, run } of cases) {
      let timer;
      try {
        await Promise.race([
          run({ base, request, browser, dist }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`timed out after ${CASE_TIMEOUT_MS}ms`)),
              CASE_TIMEOUT_MS,
            );
          }),
        ]);
        passed += 1;
        console.log(`PASS  ${demo} › ${name}`);
      } catch (error) {
        failed += 1;
        const reason = String(error?.message ?? error).replace(
          /\s*\n\s*/g,
          " ",
        );
        console.log(`FAIL  ${demo} › ${name}  ${reason}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }
} catch (error) {
  failed += 1;
  console.log(`FAIL  setup  ${error?.message ?? error}`);
} finally {
  if (browserPromise) await (await browserPromise).close();
  server.kill();
}

const total = passed + failed;
if (failed || total === 0) {
  console.log(`FAILED  ${passed}/${total} cases passed`);
  process.exit(1);
}
console.log(`ALL PASS  ${passed}/${total} cases in ${files.length} file(s)`);
