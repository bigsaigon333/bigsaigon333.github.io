// Reduces plan.json + .progress/events.jsonl to one state object.
// Shared by server.mjs (GET /api/state) and watch.mjs (terminal view).
//
// plan.json is the static board (waves, stages, checkpoints); events only change states.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eventsFile } from "./emit.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PLAN_FILE = path.join(HERE, "plan.json");

/** Stage states that mean "an agent is working on it right now". */
export const ACTIVE_STATES = ["start", "ground", "red", "impl", "verify"];
export const STAGE_STATES = [...ACTIVE_STATES, "pass", "fail", "blocked"];
export const STAGE_LABELS = {
  pending: "대기",
  start: "시작",
  ground: "근거",
  red: "Red",
  impl: "구현",
  verify: "검증",
  pass: "통과",
  fail: "실패",
  blocked: "차단",
};

const WAVE_STATE_BY_EVENT = {
  start: "running",
  integrating: "integrating",
  done: "done",
};
const WAVE_EVENT_LABELS = {
  start: "시작",
  integrating: "통합 중",
  done: "완료",
};
const CHECKPOINT_EVENT_LABELS = { waiting: "확인 대기", approved: "승인" };
const SCOPE_LABELS = {
  integration: "통합",
  agent: "에이전트",
  selftest: "셀프테스트",
};
const EVENT_LOG_SIZE = 50;
const TEXT_LIMIT = 240;

const key = (id) =>
  String(id ?? "")
    .trim()
    .toLowerCase();
const lower = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const clip = (text) =>
  text.length > TEXT_LIMIT ? text.slice(0, TEXT_LIMIT - 1) + "…" : text;

export const shortCommit = (commit) => String(commit ?? "").slice(0, 7);

/** 850 -> "850ms", 12340 -> "12.3초", 83000 -> "1분 23초". */
export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(1)}초`;
  const totalSeconds = Math.round(n / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours
    ? `${hours}시간 ${minutes}분`
    : `${minutes}분 ${totalSeconds % 60}초`;
}

// ------------------------------------------------------------------------------ reading

function readPlan(file) {
  try {
    const plan = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      title: typeof plan.title === "string" ? plan.title : "",
      waves: Array.isArray(plan.waves) ? plan.waves : [],
      checkpoints: Array.isArray(plan.checkpoints) ? plan.checkpoints : [],
      error: null,
    };
  } catch (err) {
    return {
      title: "",
      waves: [],
      checkpoints: [],
      error: `plan.json: ${err.message}`,
    };
  }
}

/** Missing file -> no events. Lines that are not a JSON object with a string `type` are counted and skipped. */
function readEvents(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return { events: [], malformed: 0 };
  }
  const events = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed);
      if (
        event &&
        typeof event === "object" &&
        !Array.isArray(event) &&
        typeof event.type === "string"
      ) {
        events.push(event);
      } else {
        malformed++;
      }
    } catch {
      malformed++; // includes a line another process is still in the middle of appending
    }
  }
  return { events, malformed };
}

// ---------------------------------------------------------------------------- summaries

export function verifyOk(event) {
  if (typeof event.ok === "boolean") return event.ok;
  return (
    Array.isArray(event.results) && event.results.every((r) => r?.ok !== false)
  );
}

function resultCounts(result) {
  const failed = Array.isArray(result?.failed) ? result.failed.length : 0;
  return {
    pass: Number(result?.pass) || 0,
    fail: Number(result?.fail) || failed,
  };
}

/** "통합 검증 실패 · routes ✓14 · head ✓13 ✕1 · 42.1초" (per check: passed, then failed when any). */
export function summarizeVerify(event) {
  const who = [
    ...new Set([event.agent, event.stage].filter(Boolean).map(String)),
  ].join(" ");
  const scopeKey = lower(event.scope);
  // "V1 검증 통과" already says it is an agent run; keep the scope word for the other scopes.
  const scope =
    scopeKey === "agent" && who
      ? ""
      : (SCOPE_LABELS[scopeKey] ?? (event.scope ? String(event.scope) : ""));
  const parts = [
    `${[scope, who].filter(Boolean).join(" ")} 검증 ${verifyOk(event) ? "통과" : "실패"}`.trim(),
  ];
  for (const result of Array.isArray(event.results) ? event.results : []) {
    const { pass, fail } = resultCounts(result);
    parts.push(`${result?.check ?? "?"} ✓${pass}${fail ? ` ✕${fail}` : ""}`);
  }
  const duration = formatDuration(event.durationMs);
  if (duration) parts.push(duration);
  return clip(parts.join(" · "));
}

/** Short Korean one-liner for the event log (page and terminal). */
export function summarizeEvent(event) {
  switch (event.type) {
    case "stage": {
      const state = lower(event.state);
      const parts = [
        `${event.stage ?? "?"} → ${STAGE_LABELS[state] ?? event.state ?? "?"}`,
      ];
      if (event.agent) parts.push(String(event.agent));
      if (Number(event.attempt) > 1) parts.push(`시도 ${event.attempt}`);
      if (event.commit) parts.push(shortCommit(event.commit));
      return clip(parts.join(" · ") + (event.msg ? ` — ${event.msg}` : ""));
    }
    case "wave":
      return clip(
        `${event.wave ?? "?"} 웨이브 ${WAVE_EVENT_LABELS[lower(event.state)] ?? event.state ?? "?"}`,
      );
    case "verify":
      return summarizeVerify(event);
    case "checkpoint": {
      const notes = normalizeNotes(event.notes);
      const label =
        CHECKPOINT_EVENT_LABELS[lower(event.state)] ?? event.state ?? "?";
      return clip(
        `${event.id ?? "?"} ${label}${notes.length ? ` · 노트 ${notes.length}개` : ""}`,
      );
    }
    case "usage": {
      const tokens = Number(event.tokens);
      const parts = [String(event.agent ?? "?")];
      if (Number.isFinite(tokens))
        parts.push(`토큰 ${tokens.toLocaleString("en-US")}`);
      const duration = formatDuration(event.durationMs);
      if (duration) parts.push(duration);
      return clip(parts.join(" · "));
    }
    default: {
      // log, ruling, merge, deploy and any unknown type
      if (event.msg != null) return clip(String(event.msg));
      const { ts, type, ...rest } = event;
      return clip(Object.keys(rest).length ? JSON.stringify(rest) : "");
    }
  }
}

function normalizeNotes(notes) {
  if (Array.isArray(notes)) return notes.map(String).filter(Boolean);
  if (typeof notes === "string")
    return notes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

// ------------------------------------------------------------------------------ reducer

/** Pure reducer: (plan, events in file order) -> state. Unknown event types change nothing. */
export function reduceState(plan, events, meta = {}) {
  const stageIndex = new Map(); // lowercased stage id -> stage
  const waveIndex = new Map(); // lowercased wave id -> wave
  const checkpointIndex = new Map();
  const waveOfStage = new Map(); // stage -> wave
  const explicitWaveState = new Map(); // wave -> state from the latest `wave` event
  const lastActivity = new Map(); // wave -> index of the latest event that touched it

  const waves = plan.waves.map((w) => {
    const wave = {
      id: String(w.id),
      part: w.part ?? "",
      title: w.title ?? "",
      state: "pending",
      doneStages: 0,
      totalStages: 0,
      updatedAt: null,
      stages: [],
    };
    for (const s of Array.isArray(w.stages) ? w.stages : []) {
      const stage = {
        id: String(s.id),
        title: s.title ?? "",
        agent: s.agent ?? null,
        state: "pending",
        attempt: 0,
        msg: null,
        commit: null,
        note: null,
        startedAt: null,
        updatedAt: null,
      };
      wave.stages.push(stage);
      stageIndex.set(key(stage.id), stage);
      waveOfStage.set(stage, wave);
    }
    waveIndex.set(key(wave.id), wave);
    return wave;
  });

  const checkpoints = plan.checkpoints.map((c) => {
    const checkpoint = {
      id: String(c.id),
      after: c.after ?? null,
      title: c.title ?? "",
      state: "pending",
      notes: [],
      updatedAt: null,
    };
    checkpointIndex.set(key(checkpoint.id), checkpoint);
    return checkpoint;
  });

  const touchWave = (wave, event, seq) => {
    lastActivity.set(wave, seq);
    if (event.ts) wave.updatedAt = event.ts;
  };

  let tokens = 0;
  let startedAt = null;
  let lastEventAt = null;
  let latestVerify = null;
  let latestIntegration = null;
  const latestByAgent = {};

  events.forEach((event, seq) => {
    if (event.ts) {
      startedAt ??= event.ts;
      lastEventAt = event.ts;
    }
    switch (event.type) {
      case "stage": {
        const stage = stageIndex.get(key(event.stage));
        const state = lower(event.state);
        if (!stage || !STAGE_STATES.includes(state)) break;
        const previous = stage.state;
        stage.state = state;
        if (event.agent != null && event.agent !== "")
          stage.agent = String(event.agent);
        const attempt = Number(event.attempt);
        if (event.attempt != null && Number.isFinite(attempt) && attempt > 0)
          stage.attempt = attempt;
        else if (stage.attempt === 0) stage.attempt = 1;
        else if (
          state === "start" &&
          (previous === "fail" || previous === "blocked")
        )
          stage.attempt += 1;
        stage.msg =
          event.msg != null && event.msg !== "" ? String(event.msg) : null; // msg describes the current state only
        if (event.commit != null && event.commit !== "")
          stage.commit = String(event.commit);
        if (event.note != null && event.note !== "")
          stage.note = String(event.note);
        if (event.ts) {
          stage.startedAt ??= event.ts;
          stage.updatedAt = event.ts;
        }
        touchWave(waveOfStage.get(stage), event, seq);
        break;
      }
      case "wave": {
        const wave = waveIndex.get(key(event.wave));
        const state = WAVE_STATE_BY_EVENT[lower(event.state)];
        if (!wave || !state) break;
        explicitWaveState.set(wave, state);
        touchWave(wave, event, seq);
        break;
      }
      case "checkpoint": {
        const checkpoint = checkpointIndex.get(key(event.id));
        const state = lower(event.state);
        if (!checkpoint || (state !== "waiting" && state !== "approved")) break;
        checkpoint.state = state;
        const notes = normalizeNotes(event.notes);
        if (notes.length) checkpoint.notes = notes;
        if (event.ts) checkpoint.updatedAt = event.ts;
        break;
      }
      case "usage": {
        const n = Number(event.tokens);
        if (Number.isFinite(n)) tokens += n;
        break;
      }
      case "verify": {
        latestVerify = event;
        if (lower(event.scope) === "integration") latestIntegration = event;
        if (event.agent != null && event.agent !== "")
          latestByAgent[String(event.agent)] = event;
        break;
      }
      default:
        break; // log, ruling, merge, deploy, unknown: event log only
    }
  });

  let doneStages = 0;
  let totalStages = 0;
  const activeStages = [];
  for (const wave of waves) {
    wave.totalStages = wave.stages.length;
    wave.doneStages = wave.stages.filter((s) => s.state === "pass").length;
    totalStages += wave.totalStages;
    doneStages += wave.doneStages;
    for (const stage of wave.stages)
      if (ACTIVE_STATES.includes(stage.state)) activeStages.push(stage.id);
    // No wave event: done when every stage passed, running once any stage has left `pending`.
    const inferred =
      wave.totalStages > 0 && wave.doneStages === wave.totalStages
        ? "done"
        : wave.stages.some((s) => s.state !== "pending")
          ? "running"
          : "pending";
    wave.state = explicitWaveState.get(wave) ?? inferred;
  }

  // Current wave: the in-progress wave with the most recent activity, else the next one not done.
  const inProgress = waves.filter(
    (w) => w.state === "running" || w.state === "integrating",
  );
  const current =
    inProgress.reduce(
      (best, w) =>
        !best || (lastActivity.get(w) ?? -1) > (lastActivity.get(best) ?? -1)
          ? w
          : best,
      null,
    ) ??
    waves.find((w) => w.state !== "done") ??
    null;
  const next = checkpoints.find((c) => c.state !== "approved") ?? null;

  return {
    title: plan.title,
    waves,
    checkpoints,
    summary: {
      currentWave: current && {
        id: current.id,
        title: current.title,
        part: current.part,
        state: current.state,
      },
      doneStages,
      totalStages,
      nextCheckpoint: next && {
        id: next.id,
        title: next.title,
        after: next.after,
        state: next.state,
      },
      startedAt,
      lastEventAt,
      tokens,
      agentsRunning: activeStages.length,
      activeStages,
    },
    verify: { ...(latestIntegration ?? latestVerify ?? {}), latestByAgent },
    events: events
      .slice(-EVENT_LOG_SIZE)
      .reverse()
      .map((event) => ({ ...event, _text: summarizeEvent(event) })),
    meta: {
      eventCount: events.length,
      malformedLines: meta.malformed ?? 0,
      planError: plan.error ?? null,
      eventsFile: meta.eventsFile ?? null,
    },
  };
}

/** Read plan.json and events.jsonl from disk and reduce them. Never throws on bad input files. */
export function readState({
  planFile = PLAN_FILE,
  eventsFile: file = eventsFile(),
} = {}) {
  const plan = readPlan(planFile);
  const { events, malformed } = readEvents(file);
  return reduceState(plan, events, { malformed, eventsFile: file });
}
