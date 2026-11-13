// A custom log handler (Astro 7 logger API): the default export returns a destination,
// `{ write(message) }`. It keeps messages at or above `config.level` in a process-wide ring
// buffer so that /s85/logger can show what reached the handler. Plain .mjs because Astro also
// imports it directly in Node when it loads the config.
import { matchesLevel } from "astro/logger";

const KEY = Symbol.for("astro-lab.s85.logs");
const MAX = 500;
const SGR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** @returns {Array<{ level: string, label: string | null, message: string }>} */
export function recordedLogs() {
  const store = /** @type {Record<symbol, any>} */ (globalThis);
  return (store[KEY] ??= []);
}

/**
 * @param {{ level?: import("astro").AstroLoggerLevel }} [config]
 * @returns {import("astro").AstroLoggerDestination}
 */
export default function logRecorder(config = {}) {
  const level = config.level ?? "info";
  return {
    write(event) {
      if (!matchesLevel(event.level, level)) return;
      const logs = recordedLogs();
      logs.push({
        level: event.level,
        label: event.label,
        message: event.message.replace(SGR, ""),
      });
      if (logs.length > MAX) logs.splice(0, logs.length - MAX);
    },
  };
}
