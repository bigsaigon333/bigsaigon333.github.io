import { logout, requireUser, testLogin } from "./auth";
import {
  createThread,
  deleteComment,
  editComment,
  listThreads,
  reply,
  resolveThread,
  setBan,
} from "./comments";
import type { Health, MeResponse, TokenResponse } from "./contract";
import { mode, type Env } from "./env";
import {
  empty,
  errorResponse,
  HttpError,
  isAllowedOrigin,
  json,
  preflight,
  readJson,
  withCors,
} from "./http";
import { callback, start } from "./oauth";

type Handler = (
  request: Request,
  env: Env,
  params: string[],
) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  /** 댓글 데이터를 바꾸는 요청. MODE=readonly 면 503. */
  write?: boolean;
}

const ID = "([A-Za-z0-9-]{1,128})";

/** 글 목록은 30초 동안 캐시해도 된다. 클라이언트는 자기 쓰기 직후에는 cache: "no-cache" 로 다시 받는다. */
const LIST_CACHE = "public, max-age=30";

const routes: Route[] = [
  {
    method: "GET",
    pattern: /^\/v1\/health$/,
    handler: async (_request, env) =>
      json({ ok: true, mode: mode(env) } satisfies Health),
  },
  {
    method: "GET",
    pattern: new RegExp(`^/v1/posts/${ID}/threads$`),
    handler: async (request, env, [postId]) =>
      json(
        await listThreads(env, postId!, new URL(request.url).searchParams),
        200,
        { "Cache-Control": LIST_CACHE },
      ),
  },
  {
    method: "POST",
    pattern: new RegExp(`^/v1/posts/${ID}/threads$`),
    write: true,
    handler: async (request, env, [postId]) => {
      const user = await requireUser(request, env);
      return json(
        await createThread(env, user, postId!, await readJson(request)),
        201,
      );
    },
  },
  {
    method: "POST",
    pattern: new RegExp(`^/v1/threads/${ID}/comments$`),
    write: true,
    handler: async (request, env, [threadId]) => {
      const user = await requireUser(request, env);
      return json(
        await reply(env, user, threadId!, await readJson(request)),
        201,
      );
    },
  },
  {
    method: "POST",
    pattern: new RegExp(`^/v1/threads/${ID}/resolve$`),
    write: true,
    handler: async (request, env, [threadId]) => {
      const user = await requireUser(request, env);
      return json(
        await resolveThread(env, user, threadId!, await readJson(request)),
      );
    },
  },
  {
    method: "PATCH",
    pattern: new RegExp(`^/v1/comments/${ID}$`),
    write: true,
    handler: async (request, env, [commentId]) => {
      const user = await requireUser(request, env);
      return json(
        await editComment(env, user, commentId!, await readJson(request)),
      );
    },
  },
  {
    method: "DELETE",
    pattern: new RegExp(`^/v1/comments/${ID}$`),
    write: true,
    handler: async (request, env, [commentId]) => {
      const user = await requireUser(request, env);
      return json(await deleteComment(env, user, commentId!));
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/me$/,
    handler: async (request, env) => {
      const user = await requireUser(request, env);
      const { banned, ...rest } = user;
      return json({ user: rest, banned } satisfies MeResponse);
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/auth\/logout$/,
    handler: async (request, env) => {
      await logout(request, env);
      return empty();
    },
  },
  {
    method: "POST",
    pattern: /^\/v1\/auth\/test-login$/,
    handler: async (request, env) => {
      if (env.TEST_LOGIN !== "1")
        throw new HttpError(404, "not_found", "not found");
      const token = await testLogin(env, await readJson(request));
      return json({ token } satisfies TokenResponse);
    },
  },
  {
    method: "GET",
    pattern: /^\/v1\/auth\/start$/,
    handler: (request, env) => start(request, env),
  },
  {
    method: "GET",
    pattern: /^\/v1\/auth\/callback$/,
    handler: (request, env) => callback(request, env),
  },
  {
    method: "POST",
    pattern: /^\/v1\/admin\/users\/(\d{1,15})\/ban$/,
    write: true,
    handler: async (request, env, [id]) => {
      const user = await requireUser(request, env);
      await setBan(env, user, Number(id), true, await readJson(request));
      return empty();
    },
  },
  {
    method: "DELETE",
    pattern: /^\/v1\/admin\/users\/(\d{1,15})\/ban$/,
    write: true,
    handler: async (request, env, [id]) => {
      const user = await requireUser(request, env);
      await setBan(env, user, Number(id), false, {});
      return empty();
    },
  },
];

async function route(request: Request, env: Env): Promise<Response> {
  const { pathname } = new URL(request.url);
  let pathMatched = false;
  for (const candidate of routes) {
    const match = candidate.pattern.exec(pathname);
    if (!match) continue;
    pathMatched = true;
    if (candidate.method !== request.method) continue;
    if (candidate.write && mode(env) === "readonly") {
      throw new HttpError(503, "readonly", "comments are read-only right now");
    }
    return candidate.handler(request, env, match.slice(1));
  }
  if (pathMatched)
    throw new HttpError(405, "method_not_allowed", "method not allowed");
  throw new HttpError(404, "not_found", "not found");
}

export async function handle(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") return preflight(request, env);
  let response: Response;
  try {
    const origin = request.headers.get("Origin");
    // 쿠키를 쓰지 않으니 CSRF 는 없지만, 목록에 없는 출처의 쓰기는 처리하기 전에 막는다.
    if (
      request.method !== "GET" &&
      request.method !== "HEAD" &&
      origin !== null &&
      !isAllowedOrigin(env, origin)
    ) {
      throw new HttpError(403, "origin_not_allowed", "origin is not allowed");
    }
    response = await route(request, env);
  } catch (error) {
    if (error instanceof HttpError) response = errorResponse(error);
    else {
      console.error(error);
      response = errorResponse(
        new HttpError(500, "internal", "internal error"),
      );
    }
  }
  return withCors(response, request, env);
}

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
