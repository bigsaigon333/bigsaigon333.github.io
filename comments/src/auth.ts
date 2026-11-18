import {
  MIN_ACCOUNT_AGE_MS,
  SESSION_TTL_MS,
  type TestLoginRequest,
  type User,
} from "./contract";
import { randomToken, sha256Hex } from "./crypto";
import { ownerId, type Env } from "./env";
import { HttpError } from "./http";

export interface SessionUser extends User {
  banned: boolean;
}

export interface GitHubProfile {
  id: number;
  login: string;
  avatarUrl: string;
  /** GitHub 가입 시각(epoch ms). */
  createdAt: number;
}

interface UserRow {
  id: number;
  login: string;
  avatar_url: string;
  banned: number;
}

export function toUser(env: Env, row: UserRow): User {
  return {
    id: row.id,
    login: row.login,
    avatarUrl: row.avatar_url,
    isOwner: row.id === ownerId(env),
  };
}

/** 가입한 지 7일이 안 된 계정은 로그인할 수 없다(스팸 계정 대응). */
export function assertAccountAge(profile: GitHubProfile, now = Date.now()) {
  if (
    !Number.isFinite(profile.createdAt) ||
    now - profile.createdAt < MIN_ACCOUNT_AGE_MS
  ) {
    throw new HttpError(
      403,
      "account_too_new",
      "GitHub accounts younger than 7 days cannot comment",
    );
  }
}

/** 사용자를 저장하고 새 세션 토큰(원문)을 돌려준다. DB 에는 sha256 만 남는다. */
export async function signIn(
  env: Env,
  profile: GitHubProfile,
): Promise<string> {
  assertAccountAge(profile);
  const now = Date.now();
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, login, avatar_url, github_created_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(id) DO UPDATE SET login = excluded.login, avatar_url = excluded.avatar_url,
         github_created_at = excluded.github_created_at, updated_at = excluded.updated_at`,
    ).bind(
      profile.id,
      profile.login,
      profile.avatarUrl,
      profile.createdAt,
      now,
    ),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(await sha256Hex(token), profile.id, now, now + SESSION_TTL_MS),
  ]);
  return token;
}

function bearer(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]{20,128})$/.exec(header);
  return match ? match[1]! : null;
}

export async function currentUser(
  request: Request,
  env: Env,
): Promise<SessionUser | null> {
  const token = bearer(request);
  if (!token) return null;
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT s.expires_at, u.id, u.login, u.avatar_url, u.banned
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
  )
    .bind(hash)
    .first<UserRow & { expires_at: number }>();
  if (!row) throw new HttpError(401, "unauthorized", "unknown token");
  if (row.expires_at <= Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(hash)
      .run();
    throw new HttpError(401, "session_expired", "session expired");
  }
  return { ...toUser(env, row), banned: row.banned === 1 };
}

export async function requireUser(
  request: Request,
  env: Env,
): Promise<SessionUser> {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "unauthorized", "login required");
  return user;
}

export async function logout(request: Request, env: Env): Promise<void> {
  const token = bearer(request);
  if (!token) return;
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
    .bind(await sha256Hex(token))
    .run();
}

/** TEST_LOGIN=1 일 때만 열리는 시험용 로그인. GitHub 를 거치지 않고 토큰을 준다. */
export async function testLogin(env: Env, input: unknown): Promise<string> {
  if (env.TEST_LOGIN !== "1")
    throw new HttpError(404, "not_found", "not found");
  const body = (input ?? {}) as Partial<TestLoginRequest>;
  if (
    !Number.isSafeInteger(body.id) ||
    body.id! <= 0 ||
    typeof body.login !== "string" ||
    !/^[A-Za-z0-9-]{1,39}$/.test(body.login)
  ) {
    throw new HttpError(
      400,
      "bad_request",
      "id (positive integer) and login required",
    );
  }
  const createdAt =
    body.createdAt === undefined ? 0 : Date.parse(String(body.createdAt));
  return signIn(env, {
    id: body.id!,
    login: body.login,
    avatarUrl: "",
    createdAt,
  });
}
