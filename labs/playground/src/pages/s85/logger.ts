// POST { token }: log one line per level through context.logger (Astro 7 runtime logger).
// GET ?token=…: the messages the s85 log recorder kept that contain the token.
import type { APIRoute } from "astro";

import { recordedLogs } from "../../s85/log-recorder.mjs";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST = (async ({ request, logger }) => {
  const { token } = (await request.json()) as { token?: unknown };
  if (typeof token !== "string" || !token) {
    return json({ error: "token must be a non-empty string" }, 400);
  }
  logger.info(`s85 info ${token}`);
  logger.warn(`s85 warn ${token}`);
  logger.error(`s85 error ${token}`);
  return new Response(null, { status: 204 });
}) satisfies APIRoute;

export const GET = (({ url }) => {
  const token = url.searchParams.get("token") ?? "";
  if (!token) return json({ error: "token is required" }, 400);
  return json({
    entries: recordedLogs().filter((entry) => entry.message.includes(token)),
  });
}) satisfies APIRoute;
