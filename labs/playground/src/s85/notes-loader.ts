// A live loader: Astro calls loadCollection/loadEntry on every getLiveCollection/getLiveEntry,
// at request time, instead of once at build time. Cache hints become Astro.cache tags.
import type { LiveLoader } from "astro/loaders";

import { readNotes, type StoredNote } from "./notes-store";

export type NoteData = Omit<StoredNote, "id">;
type EntryFilter = { id: string };
type CollectionFilter = { tag?: string };

const toEntry = ({ id, ...data }: StoredNote) => ({
  id,
  data,
  cacheHint: {
    tags: [`s85-note-${id}`],
    lastModified: new Date(data.updatedAt),
  },
});

export function notesLoader(): LiveLoader<
  NoteData,
  EntryFilter,
  CollectionFilter
> {
  return {
    name: "s85-notes-file",
    async loadCollection({ filter }) {
      const notes = readNotes().filter(
        (note) => !filter?.tag || note.tag === filter.tag,
      );
      return {
        entries: notes.map(toEntry),
        cacheHint: { tags: ["s85-notes"] },
      };
    },
    async loadEntry({ filter }) {
      const note = readNotes().find((candidate) => candidate.id === filter.id);
      return note ? toEntry(note) : undefined;
    },
  };
}
