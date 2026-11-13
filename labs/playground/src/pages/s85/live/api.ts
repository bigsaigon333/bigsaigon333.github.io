// Writes to the live collection's JSON file. POST { id, title, tag, raw? } upserts (raw skips
// the title check so the schema can reject it), DELETE ?id= removes. Each write invalidates the
// cached pages tagged with that note.
import type { APIRoute } from "astro";

import { readNotes, writeNotes } from "../../../s85/notes-store";

export const prerender = false;

const ID = /^[a-z0-9-]{1,40}$/;

export const POST = (async ({ request, cache }) => {
  const body = (await request.json()) as Record<string, unknown>;
  const { id, title, tag, raw } = body;
  if (typeof id !== "string" || !ID.test(id))
    return new Response("bad id", { status: 400 });
  if (typeof title !== "string" || (!raw && !title.trim())) {
    return new Response("bad title", { status: 400 });
  }
  const note = {
    id,
    title,
    tag: typeof tag === "string" ? tag : "lab",
    updatedAt: new Date().toISOString(),
  };
  writeNotes([...readNotes().filter((other) => other.id !== id), note]);
  await cache.invalidate({ tags: [`s85-note-${id}`] });
  return new Response(JSON.stringify(note), {
    status: 201,
    headers: { "content-type": "application/json" },
  });
}) satisfies APIRoute;

export const DELETE = (async ({ url, cache }) => {
  const id = url.searchParams.get("id") ?? "";
  writeNotes(readNotes().filter((note) => note.id !== id));
  await cache.invalidate({ tags: [`s85-note-${id}`] });
  return new Response(null, { status: 204 });
}) satisfies APIRoute;
