import type { APIRoute } from "astro";

import { jsonResponse } from "../../../s81/items";

export const prerender = false;

const NAME = "s81-visits";
// HttpOnly: page scripts cannot read it. SameSite=Strict: not sent on cross-site requests.
// Path=/s81: only this demo's URLs receive it.
const OPTIONS = {
  path: "/s81",
  httpOnly: true,
  sameSite: "strict",
  maxAge: 60 * 60,
} as const;

export const GET = (({ cookies }) => {
  const visits = (cookies.get(NAME)?.number() || 0) + 1;
  cookies.set(NAME, String(visits), OPTIONS);
  return jsonResponse({ visits });
}) satisfies APIRoute;

export const DELETE = (({ cookies }) => {
  cookies.delete(NAME, { path: OPTIONS.path });
  return new Response(null, { status: 204 });
}) satisfies APIRoute;
