#!/usr/bin/env node
// Terminal view of the progress state. Zero dependencies.
//
//   node scripts/progress/watch.mjs          redraw every 2 s (Ctrl-C to quit)
//   node scripts/progress/watch.mjs --once   print once and exit
//
// Colors are plain ANSI; they are dropped when stdout is not a terminal or NO_COLOR is set.
import {
  ACTIVE_STATES,
  formatDuration,
  readState,
  summarizeVerify,
  verifyOk,
} from "./state.mjs";

const ONCE = process.argv.includes("--once");
const INTERVAL_MS = 2000;
const EVENT_ROWS = 8;
const AGENT_VERIFY_ROWS = 6;
const COLOR =
  !process.env.NO_COLOR &&
  (Boolean(process.stdout.isTTY) || Boolean(process.env.FORCE_COLOR));

const paint = (code) => (text) =>
  COLOR ? `\x1b[${code}m${text}\x1b[0m` : String(text);
const bold = paint("1");
const dim = paint("2");
const red = paint("31");
const green = paint("32");
const yellow = paint("33");
const cyan = paint("36");

const WAVE_LABELS = {
  pending: "대기",
  running: "진행 중",
  integrating: "통합 중",
  done: "완료",
};
const TYPE_WIDTH = 10;

function stageColor(state) {
  if (state === "pass") return green;
  if (state === "fail") return red;
  if (state === "blocked") return yellow;
  if (ACTIVE_STATES.includes(state)) return cyan;
  return dim;
}

function waveColor(state) {
  if (state === "done") return green;
  if (state === "running" || state === "integrating") return cyan;
  return dim;
}

function checkpointToken(checkpoint) {
  const color =
    checkpoint.state === "approved"
      ? green
      : checkpoint.state === "waiting"
        ? yellow
        : dim;
  return color(`◆${checkpoint.id}:${checkpoint.state}`);
}

function clock(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
}

function elapsed(state) {
  const { startedAt, lastEventAt, doneStages, totalStages } = state.summary;
  const start = Date.parse(startedAt);
  if (!Number.isFinite(start)) return "-";
  // Freeze the clock at the last event once everything is done.
  const end =
    totalStages > 0 && doneStages === totalStages
      ? Date.parse(lastEventAt)
      : Date.now();
  return formatDuration(Math.max(0, end - start)) || "-";
}

function render(state) {
  const { summary, waves, checkpoints, verify, events, meta } = state;
  const lines = [];

  // 1. summary line
  const wave = summary.currentWave;
  const next = summary.nextCheckpoint;
  lines.push(
    [
      bold(state.title || "진행 현황"),
      wave
        ? `웨이브 ${bold(wave.id)} ${wave.title} (${waveColor(wave.state)(wave.state)})`
        : "웨이브 모두 완료",
      `단계 ${bold(`${summary.doneStages}/${summary.totalStages}`)}`,
      next ? `다음 ${checkpointToken(next)}` : "체크포인트 모두 승인",
      `경과 ${elapsed(state)}`,
      `실행 중 ${summary.agentsRunning}`,
      `토큰 ${summary.tokens.toLocaleString("en-US")}`,
    ].join(dim(" · ")),
  );
  const waiting = checkpoints.filter((c) => c.state === "waiting");
  for (const checkpoint of waiting) {
    const notes = checkpoint.notes.length
      ? ` — 노트: ${checkpoint.notes.join(", ")}`
      : "";
    lines.push(
      yellow(bold(`▶ 지금 볼 것: ${checkpoint.id} ${checkpoint.title}`)) +
        notes,
    );
  }
  if (meta.planError) lines.push(red(meta.planError));
  lines.push("");

  // 2. one line per wave: stages as id:state tokens, checkpoints after the wave/stage they follow
  const after = new Map();
  for (const checkpoint of checkpoints) {
    const k = String(checkpoint.after ?? "").toLowerCase();
    after.set(k, [...(after.get(k) ?? []), checkpoint]);
  }
  const idWidth = Math.max(2, ...waves.map((w) => w.id.length));
  for (const w of waves) {
    const tokens = [];
    for (const stage of w.stages) {
      const attempt = stage.attempt > 1 ? `#${stage.attempt}` : "";
      tokens.push(
        stageColor(stage.state)(`${stage.id}:${stage.state}${attempt}`),
      );
      for (const checkpoint of after.get(stage.id.toLowerCase()) ?? [])
        tokens.push(checkpointToken(checkpoint));
    }
    for (const checkpoint of after.get(w.id.toLowerCase()) ?? [])
      tokens.push(checkpointToken(checkpoint));
    const head = `${bold(w.id.padEnd(idWidth))} ${waveColor(w.state)(w.state.padEnd(11))} ${String(w.doneStages).padStart(2)}/${w.totalStages}`;
    lines.push(`${head}  ${tokens.join(" ")}`);
  }
  lines.push("");

  // 3. latest verify one-liners
  lines.push(bold("검증"));
  const verifyLine = (v) =>
    `  ${dim(clock(v.ts))} ${verifyOk(v) ? green("OK  ") : red("FAIL")} ${summarizeVerify(v)}`;
  if (verify.type === "verify") {
    lines.push(verifyLine(verify));
    const others = Object.values(verify.latestByAgent)
      .filter((v) => v.ts !== verify.ts || v.agent !== verify.agent)
      .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
      .slice(0, AGENT_VERIFY_ROWS);
    for (const v of others) lines.push(verifyLine(v));
  } else {
    lines.push(dim("  아직 검증 결과가 없습니다"));
  }
  lines.push("");

  // 4. last events, newest first
  lines.push(
    bold(
      `최근 이벤트 ${Math.min(EVENT_ROWS, events.length)}건 (최신순, 전체 ${meta.eventCount}건)`,
    ),
  );
  if (!events.length) lines.push(dim("  아직 이벤트가 없습니다"));
  for (const event of events.slice(0, EVENT_ROWS)) {
    const bad =
      (event.type === "stage" &&
        (event.state === "fail" || event.state === "blocked")) ||
      (event.type === "verify" && !verifyOk(event));
    lines.push(
      `  ${dim(clock(event.ts))} ${cyan(String(event.type).padEnd(TYPE_WIDTH))} ${bad ? red(event._text) : event._text}`,
    );
  }
  if (meta.malformedLines)
    lines.push(dim(`  (읽을 수 없는 줄 ${meta.malformedLines}건 무시)`));
  return lines;
}

function snapshot() {
  try {
    return render(readState());
  } catch (err) {
    return [red(`상태를 읽지 못했습니다: ${err?.message ?? err}`)];
  }
}

if (ONCE) {
  process.stdout.write(snapshot().join("\n") + "\n");
} else {
  const TTY = Boolean(process.stdout.isTTY);
  const draw = () => {
    const lines = snapshot();
    lines.push(
      "",
      dim(
        `${clock(Date.now())} 기준 · ${INTERVAL_MS / 1000}초마다 갱신 · Ctrl-C로 종료`,
      ),
    );
    // Home, rewrite every line (erasing its old tail), then erase what is left below: a flicker-free clear.
    process.stdout.write(
      TTY
        ? "\x1b[H" +
            lines.map((line) => line + "\x1b[K").join("\n") +
            "\n\x1b[J"
        : lines.join("\n") + "\n\n",
    );
  };
  const restore = () => {
    if (TTY) process.stdout.write("\x1b[?25h");
  };
  if (TTY) process.stdout.write("\x1b[?25l\x1b[2J");
  draw();
  const timer = setInterval(draw, INTERVAL_MS);
  const quit = () => {
    clearInterval(timer);
    restore();
    process.exit(0);
  };
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);
  process.on("exit", restore);
}
