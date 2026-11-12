// Reporter for the verification harness (scripts/verify, env VERIFY_REPORTER): turns the summary of a run into the
// `verify` event the dashboard reads and appends it with emit().
//
// server.mjs points <main checkout>/.verify/reporter.mjs here when it starts, so from then on every run of
// `npm run verify`, `verify:selftest` and `verify:live`, in any worktree, reaches the dashboard. The labels come from
// the environment of the run:
//
//   PROGRESS_SCOPE   where a run of `npm run verify` is filed: local | agent | integration. "integration" replaces
//                    the result everybody reads, so it is never a default:  PROGRESS_SCOPE=integration npm run verify
//                    Unset: "agent" when PROGRESS_AGENT is set, else "local". An unknown value is warned about and
//                    the default is used. verify:selftest is always filed as "selftest", verify:live as "live".
//   PROGRESS_STAGE   stage id of the run (plan.json)
//   PROGRESS_AGENT   agent id of the run
//
// A run of `npm run verify -- --feature` is filed like any other run of `npm run verify`.
import { emit } from "./emit.mjs";

/** Where the dashboard files a run of `npm run verify`. */
export const SCOPES = ["local", "agent", "integration"];

export function scopeOf(command, env = process.env) {
  if (command === "selftest" || command === "live") return command;
  const wanted = env.PROGRESS_SCOPE;
  if (wanted) {
    if (SCOPES.includes(wanted)) return wanted;
    process.stderr.write(
      `[progress] PROGRESS_SCOPE=${wanted} is not one of ${SCOPES.join(", ")}: filed under the default\n`,
    );
  }
  return env.PROGRESS_AGENT ? "agent" : "local";
}

/** The harness awaits this with { command, ok, durationMs, results, matrix } (and feature: true for --feature). */
export default function report(summary, env = process.env) {
  emit({
    type: "verify",
    scope: scopeOf(summary.command, env),
    stage: env.PROGRESS_STAGE,
    agent: env.PROGRESS_AGENT,
    ok: summary.ok,
    durationMs: summary.durationMs,
    results: summary.results,
    matrix: summary.matrix,
  });
}
