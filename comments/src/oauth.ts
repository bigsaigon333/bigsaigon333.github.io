import { signIn, type GitHubProfile } from "./auth";
import {
  AUTH_MESSAGE_TYPE,
  ERROR_FRAGMENT,
  TOKEN_FRAGMENT,
  type AuthMessage,
  type ErrorCode,
} from "./contract";
import { pkceChallenge, randomToken } from "./crypto";
import type { Env } from "./env";
import { HttpError, isAllowedOrigin } from "./http";

const STATE_TTL_MS = 10 * 60 * 1000;
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

type AuthMode = "popup" | "redirect";

function callbackUrl(request: Request): string {
  return `${new URL(request.url).origin}/v1/auth/callback`;
}

function config(env: Env): { id: string; secret: string } {
  if (!env.GH_OAUTH_CLIENT_ID || !env.GH_OAUTH_CLIENT_SECRET) {
    throw new HttpError(
      503,
      "not_configured",
      "GitHub OAuth is not configured",
    );
  }
  return { id: env.GH_OAUTH_CLIENT_ID, secret: env.GH_OAUTH_CLIENT_SECRET };
}

/**
 * GET /v1/auth/start?origin=<사이트 출처>&mode=popup|redirect&return_to=<돌아갈 URL>
 * state 와 PKCE verifier 를 D1 에 10분 동안 두고 GitHub 로 302 한다.
 */
export async function start(request: Request, env: Env): Promise<Response> {
  const { id } = config(env);
  const url = new URL(request.url);
  const origin = url.searchParams.get("origin");
  if (!isAllowedOrigin(env, origin)) {
    throw new HttpError(403, "origin_not_allowed", "origin is not allowed");
  }
  const authMode: AuthMode =
    url.searchParams.get("mode") === "redirect" ? "redirect" : "popup";
  const returnTo = url.searchParams.get("return_to") ?? `${origin}/`;
  let returnUrl: URL;
  try {
    returnUrl = new URL(returnTo);
  } catch {
    throw new HttpError(
      400,
      "bad_request",
      "return_to must be an absolute URL",
    );
  }
  if (returnUrl.origin !== origin) {
    throw new HttpError(400, "bad_request", "return_to must be on origin");
  }
  returnUrl.hash = "";

  const state = randomToken();
  const verifier = randomToken();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_states WHERE expires_at <= ?").bind(now),
    env.DB.prepare(
      `INSERT INTO oauth_states (state, code_verifier, origin, mode, return_to, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      state,
      verifier,
      origin,
      authMode,
      returnUrl.href,
      now,
      now + STATE_TTL_MS,
    ),
  ]);

  const authorize = new URL(AUTHORIZE_URL);
  authorize.searchParams.set("client_id", id);
  authorize.searchParams.set("redirect_uri", callbackUrl(request));
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", await pkceChallenge(verifier));
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("allow_signup", "false");
  return new Response(null, {
    status: 302,
    headers: { Location: authorize.href, "Cache-Control": "no-store" },
  });
}

async function exchange(
  request: Request,
  env: Env,
  code: string,
  verifier: string,
): Promise<GitHubProfile> {
  const { id, secret } = config(env);
  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: id,
      client_secret: secret,
      code,
      redirect_uri: callbackUrl(request),
      code_verifier: verifier,
    }),
  });
  const tokenBody = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
  };
  if (!tokenResponse.ok || !tokenBody.access_token) {
    throw new HttpError(502, "oauth_failed", "code exchange failed");
  }
  const userResponse = await fetch(USER_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenBody.access_token}`,
      "User-Agent": "comments-worker",
    },
  });
  const user = (await userResponse.json().catch(() => ({}))) as {
    id?: number;
    login?: string;
    avatar_url?: string;
    created_at?: string;
  };
  if (!userResponse.ok || !Number.isSafeInteger(user.id) || !user.login) {
    throw new HttpError(502, "oauth_failed", "could not read GitHub user");
  }
  return {
    id: user.id!,
    login: user.login,
    avatarUrl: user.avatar_url ?? "",
    createdAt: Date.parse(user.created_at ?? ""),
  };
}

interface StateRow {
  code_verifier: string;
  origin: string;
  mode: AuthMode;
  return_to: string;
  expires_at: number;
}

/** GET /v1/auth/callback?code&state — state 는 한 번만 쓸 수 있다. */
export async function callback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const row = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state = ? RETURNING code_verifier, origin, mode, return_to, expires_at",
  )
    .bind(state)
    .first<StateRow>();
  if (
    !row ||
    row.expires_at <= Date.now() ||
    !isAllowedOrigin(env, row.origin)
  ) {
    return errorPage("invalid_state");
  }

  let result: { token: string } | { error: ErrorCode };
  const code = url.searchParams.get("code");
  try {
    if (!code) throw new HttpError(400, "oauth_failed", "authorization denied");
    const profile = await exchange(request, env, code, row.code_verifier);
    result = { token: await signIn(env, profile) };
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    result = { error: error.code };
  }
  return row.mode === "redirect"
    ? redirectFinish(row.return_to, result)
    : popupFinish(row.origin, row.return_to, result);
}

function fragmentUrl(
  returnTo: string,
  result: { token: string } | { error: ErrorCode },
): string {
  const url = new URL(returnTo);
  url.hash =
    "token" in result
      ? `${TOKEN_FRAGMENT}=${result.token}`
      : `${ERROR_FRAGMENT}=${result.error}`;
  return url.href;
}

function redirectFinish(
  returnTo: string,
  result: { token: string } | { error: ErrorCode },
): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: fragmentUrl(returnTo, result),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

/** JSON 을 <script> 안에 그대로 넣어도 태그가 닫히지 않게 한다. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function html(body: string, nonce: string | null, status = 200): Response {
  const scriptSrc = nonce ? `'nonce-${nonce}'` : "'none'";
  return new Response(
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인</title></head><body>${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; script-src ${scriptSrc}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/**
 * 팝업 창에 뜨는 페이지. opener 에게 정확한 origin 으로만 postMessage 하고 닫는다.
 * opener 가 없으면(COOP 등으로 끊겼으면) 리다이렉트 방식과 같은 fragment URL 로 이동한다.
 */
function popupFinish(
  origin: string,
  returnTo: string,
  result: { token: string } | { error: ErrorCode },
): Response {
  const nonce = randomToken();
  const message: AuthMessage =
    "token" in result
      ? { type: AUTH_MESSAGE_TYPE, token: result.token }
      : { type: AUTH_MESSAGE_TYPE, error: result.error };
  const script = `const m=${scriptJson(message)},o=${scriptJson(origin)},f=${scriptJson(fragmentUrl(returnTo, result))};if(window.opener){window.opener.postMessage(m,o);window.close()}else{location.replace(f)}`;
  return html(
    `<p>로그인을 마쳤습니다. 이 창은 곧 닫힙니다.</p><script nonce="${nonce}">${script}</script>`,
    nonce,
  );
}

function errorPage(code: ErrorCode): Response {
  return html(
    `<p>로그인을 마치지 못했습니다(${code}). 창을 닫고 다시 시도해 주세요.</p>`,
    null,
    400,
  );
}
