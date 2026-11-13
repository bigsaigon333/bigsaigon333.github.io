// The local data source behind the s85 live collection: a JSON file outside the project, read
// on every call. One file per server process, so parallel lab servers do not share notes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface StoredNote {
  id: string;
  title: string;
  tag: string;
  updatedAt: string;
}

const file =
  process.env.S85_NOTES_FILE ??
  path.join(os.tmpdir(), `astro-lab-s85-notes-${process.pid}.json`);

const SEEDED = Symbol.for("astro-lab.s85.notes-seeded");
const flags = globalThis as unknown as Record<symbol, boolean>;

function seed() {
  if (flags[SEEDED]) return;
  flags[SEEDED] = true;
  const now = new Date().toISOString();
  writeNotes([
    { id: "hello", title: "Hello, live content", tag: "lab", updatedAt: now },
  ]);
}

export function readNotes(): StoredNote[] {
  seed();
  return JSON.parse(fs.readFileSync(file, "utf8")) as StoredNote[];
}

export function writeNotes(notes: StoredNote[]) {
  fs.writeFileSync(file, JSON.stringify(notes, null, 2));
}
