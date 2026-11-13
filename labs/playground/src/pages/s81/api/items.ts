import type { APIRoute } from "astro";

import {
  createItem,
  findItem,
  jsonResponse,
  listItems,
} from "../../../s81/items";

// The site is static by default; this endpoint runs on every request.
export const prerender = false;

export const GET = (({ url }) => {
  const id = url.searchParams.get("id");
  if (id === null) return jsonResponse({ items: listItems() });
  const item = findItem(id);
  return item
    ? jsonResponse(item)
    : jsonResponse({ error: "not found" }, { status: 404 });
}) satisfies APIRoute;

export const POST = (async ({ request }) => {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("application/json"))
    return jsonResponse({ error: "send application/json" }, { status: 415 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ error: "body is not valid JSON" }, { status: 400 });
  }
  const result = createItem(input);
  if ("error" in result) return jsonResponse(result, { status: 400 });
  return jsonResponse(result, {
    status: 201,
    headers: { Location: `/s81/api/items?id=${result.id}` },
  });
}) satisfies APIRoute;
