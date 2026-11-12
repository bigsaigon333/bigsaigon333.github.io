#!/usr/bin/env node
// Progress event writer: appends one JSON line to <main checkout>/.progress/events.jsonl.
//
//   CLI     node scripts/progress/emit.mjs <type> key=value ... [--json '<object>']
//   module  import { emit } from './emit.mjs'; emit({ type: 'log', msg: '...' });
//
// Zero dependencies. emit() never throws: reporting progress must not break the work.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let cachedRoot;

/**
 * Absolute path of the MAIN checkout root. Every worktree shares one git common dir
 * (<main>/.git), so this is the same path no matter which worktree the caller is in.
 */
export function mainRoot() {
  if (cachedRoot) return cachedRoot;
  // Ask from this file's directory first so the answer does not depend on process.cwd().
  for (const cwd of [HERE, process.cwd()]) {
    try {
      const commonDir = execFileSync(
        'git',
        ['rev-parse', '--path-format=absolute', '--git-common-dir'],
        { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      ).trim();
      if (commonDir) return (cachedRoot = path.dirname(commonDir));
    } catch {
      // not a git checkout (or git missing): try the next candidate
    }
  }
  return (cachedRoot = path.resolve(HERE, '..', '..'));
}

/** The `.progress` directory. Env PROGRESS_DIR overrides it (used by tests). */
export function progressDir() {
  const override = process.env.PROGRESS_DIR;
  return override ? path.resolve(override) : path.join(mainRoot(), '.progress');
}

export function eventsFile() {
  return path.join(progressDir(), 'events.jsonl');
}

/**
 * Append one event. Adds `ts` when missing. Returns true when the line was written,
 * false (after a one-line warning on stderr) when it could not be.
 */
export function emit(event) {
  try {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new TypeError('event must be an object');
    }
    const { ts, type, ...rest } = event;
    const line = JSON.stringify({ ts: ts || new Date().toISOString(), type, ...rest });
    fs.mkdirSync(progressDir(), { recursive: true });
    fs.appendFileSync(eventsFile(), line + '\n');
    return true;
  } catch (err) {
    warn(`emit failed: ${err?.message ?? err}`);
    return false;
  }
}

function warn(message) {
  try {
    process.stderr.write(`[progress] ${String(message).replace(/\s+/g, ' ').trim()}\n`);
  } catch {
    // stderr is gone; nothing left to report to
  }
}

// ---------------------------------------------------------------------------------- CLI

const USAGE = `usage: node scripts/progress/emit.mjs <type> [key=value ...] [--json '<object>']

  stage       stage=S1.1 agent=SK state=start|ground|red|impl|verify|pass|fail|blocked
              [attempt=2] [msg=...] [commit=abc1234] [note=docs/astro-notes/01-x.md]
  wave        wave=W1 state=start|integrating|done
  checkpoint  id=CP1 state=waiting|approved [notes='["docs/astro-notes/01-x.md"]']
  usage       agent=SK tokens=12345 durationMs=60000
  log | ruling | merge | deploy   msg=...
  verify      pass the whole event with --json

Values that are JSON numbers, true/false, arrays or objects are parsed; anything else
stays a string. Prints nothing on success.`;

/** `12` -> 12, `true` -> true, `[..]`/`{..}` -> parsed; everything else stays a string. */
function parseValue(raw) {
  try {
    const value = JSON.parse(raw);
    if (typeof value === 'boolean') return value;
    // Only canonical numbers become numbers, so hex-looking ids such as a commit
    // `1e52345` or `0012345` are not silently turned into Infinity or 12345.
    if (typeof value === 'number') return Number.isFinite(value) && String(value) === raw ? value : raw;
    if (value !== null && typeof value === 'object') return value;
  } catch {
    // not JSON: keep the raw string
  }
  return raw;
}

function cli(argv) {
  const data = {};
  let type;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      process.stdout.write(USAGE + '\n');
      return 0;
    }
    if (arg === '--json' || arg.startsWith('--json=')) {
      const raw = arg === '--json' ? argv[++i] : arg.slice('--json='.length);
      let obj;
      try {
        obj = JSON.parse(raw ?? '');
      } catch (err) {
        warn(`--json is not valid JSON: ${err.message}`);
        return 2;
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        warn('--json must be a JSON object');
        return 2;
      }
      Object.assign(data, obj);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq > 0) data[arg.slice(0, eq)] = parseValue(arg.slice(eq + 1));
    else if (type === undefined && eq === -1) type = arg;
    else warn(`ignored argument (expected key=value): ${arg}`);
  }
  type ??= typeof data.type === 'string' ? data.type : undefined;
  if (!type) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  return emit({ ...data, type }) ? 0 : 1;
}

/** True only when this file is the program being run, not when it is imported. */
function isMain() {
  if (typeof import.meta.main === 'boolean') return import.meta.main; // Node >= 24.2
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) process.exitCode = cli(process.argv.slice(2));
