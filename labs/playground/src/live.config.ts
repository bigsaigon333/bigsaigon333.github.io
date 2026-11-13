// Live collections (Astro 7): loaded per request, not at build time. Owned by S8.5.
import { defineLiveCollection } from "astro:content";
import { z } from "astro/zod";

import { notesLoader } from "./s85/notes-loader";

const s85Notes = defineLiveCollection({
  loader: notesLoader(),
  // Validated on every load; a bad entry comes back as LiveCollectionValidationError.
  schema: z.object({
    title: z.string().min(1),
    tag: z.string(),
    updatedAt: z.string(),
  }),
});

export const collections = { s85Notes };
