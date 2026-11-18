import type { ApiError, ErrorCode } from "./contract";
import { allowedOrigins, type Env } from "./env";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

export function empty(status = 204): Response {
  return new Response(null, {
    status,
    headers: { ...BASE_HEADERS, "Cache-Control": "no-store" },
  });
}

export function errorResponse(error: HttpError): Response {
  const body: ApiError = {
    error: { code: error.code, message: error.message },
  };
  return json(body, error.status, error.headers);
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 64 * 1024)
    throw new HttpError(413, "bad_request", "body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_request", "body must be JSON");
  }
}

const ALLOW_METHODS = "GET, POST, PATCH, DELETE, OPTIONS";
const ALLOW_HEADERS = "Authorization, Content-Type";

/**
 * CORS 는 정확한 출처 목록만 허용한다. 쿠키를 쓰지 않으므로 Allow-Credentials 는 내보내지 않는다.
 * 허용하지 않은 출처의 쓰기 요청은 처리 전에 403 으로 거부한다(index.ts).
 */
export function isAllowedOrigin(env: Env, origin: string | null): boolean {
  return origin !== null && allowedOrigins(env).has(origin);
}

export function preflight(request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  if (!isAllowedOrigin(env, origin)) {
    return new Response(null, {
      status: 403,
      headers: { ...BASE_HEADERS, Vary: "Origin" },
    });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...BASE_HEADERS,
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

export function withCors(
  response: Response,
  request: Request,
  env: Env,
): Response {
  const origin = request.headers.get("Origin");
  const headers = new Headers(response.headers);
  headers.append("Vary", "Origin");
  if (isAllowedOrigin(env, origin)) {
    headers.set("Access-Control-Allow-Origin", origin!);
    headers.set("Access-Control-Expose-Headers", "Retry-After");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
