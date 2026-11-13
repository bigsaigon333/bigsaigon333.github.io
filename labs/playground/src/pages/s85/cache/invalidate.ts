// POST { tags } or { path }: context.cache.invalidate() drops matching entries from memoryCache().
// Path invalidation is exact-match only (pathname plus the normalized query string).
import type { APIRoute } from "astro";

export const prerender = false;

export const POST = (async ({ request, cache }) => {
  const body = (await request.json()) as { tags?: unknown; path?: unknown };
  if (
    Array.isArray(body.tags) &&
    body.tags.every((tag) => typeof tag === "string")
  ) {
    await cache.invalidate({ tags: body.tags });
  } else if (typeof body.path === "string") {
    await cache.invalidate({ path: body.path });
  } else {
    return new Response("expected { tags: string[] } or { path: string }", {
      status: 400,
    });
  }
  return new Response(null, { status: 204 });
}) satisfies APIRoute;
