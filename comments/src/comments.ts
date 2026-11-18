import type { SessionUser } from "./auth";
import { toUser } from "./auth";
import {
  BODY_MAX,
  BODY_MIN,
  PAGE_DEFAULT,
  PAGE_MAX,
  QUOTE_CONTEXT_MAX,
  QUOTE_EXACT_MAX,
  RATE_LIMIT,
  RATE_WINDOW_MS,
  type Anchor,
  type Comment,
  type Thread,
  type ThreadPage,
} from "./contract";
import type { Env } from "./env";
import { HttpError } from "./http";

const POST_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validatePostId(id: string): string {
  if (id.length > 128 || !POST_ID.test(id)) {
    throw new HttpError(400, "invalid_post", "invalid post id");
  }
  return id;
}

/** 평문 1–4000자(코드 포인트). 줄바꿈과 탭 말고 제어 문자는 받지 않는다. */
export function validateBody(input: unknown): string {
  if (typeof input !== "string")
    throw new HttpError(400, "invalid_body", "body must be a string");
  const body = input.replace(/\r\n?/g, "\n").trim();
  const length = [...body].length;
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(body)) {
    throw new HttpError(
      400,
      "invalid_body",
      "control characters are not allowed",
    );
  }
  if (length < BODY_MIN || length > BODY_MAX) {
    throw new HttpError(
      400,
      "invalid_body",
      `body must be ${BODY_MIN}-${BODY_MAX} characters`,
    );
  }
  return body;
}

export function validateAnchor(input: unknown): Anchor | null {
  if (input === undefined || input === null) return null;
  const fail = (message: string) =>
    new HttpError(400, "invalid_anchor", message);
  if (typeof input !== "object") throw fail("anchor must be an object");
  const { exact, prefix, suffix, start, end } = input as Record<
    string,
    unknown
  >;
  if (
    typeof exact !== "string" ||
    exact.length < 1 ||
    [...exact].length > QUOTE_EXACT_MAX
  )
    throw fail(`exact must be 1-${QUOTE_EXACT_MAX} characters`);
  for (const [name, value] of [
    ["prefix", prefix],
    ["suffix", suffix],
  ] as const) {
    if (typeof value !== "string" || [...value].length > QUOTE_CONTEXT_MAX)
      throw fail(`${name} must be at most ${QUOTE_CONTEXT_MAX} characters`);
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    (start as number) < 0 ||
    (start as number) >= (end as number)
  ) {
    throw fail("start and end must be integers with 0 <= start < end");
  }
  return {
    exact,
    prefix: prefix as string,
    suffix: suffix as string,
    start: start as number,
    end: end as number,
  };
}

const iso = (ms: number | null) =>
  ms === null ? null : new Date(ms).toISOString();

interface ThreadRow {
  id: string;
  post_id: string;
  author_id: number;
  quote_exact: string | null;
  quote_prefix: string | null;
  quote_suffix: string | null;
  pos_start: number | null;
  pos_end: number | null;
  resolved_at: number | null;
  created_at: number;
}

interface CommentRow {
  id: string;
  thread_id: string;
  author_id: number;
  body: string;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  login: string;
  avatar_url: string;
  banned: number;
}

const COMMENT_SELECT = `SELECT c.id, c.thread_id, c.author_id, c.body, c.created_at, c.edited_at, c.deleted_at,
  u.login, u.avatar_url, u.banned FROM comments c JOIN users u ON u.id = c.author_id`;

function toComment(env: Env, row: CommentRow): Comment {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    threadId: row.thread_id,
    author: toUser(env, {
      id: row.author_id,
      login: row.login,
      avatar_url: row.avatar_url,
      banned: row.banned,
    }),
    body: deleted ? "" : row.body,
    createdAt: iso(row.created_at)!,
    editedAt: iso(row.edited_at),
    deleted,
  };
}

function toThread(row: ThreadRow, comments: Comment[]): Thread {
  return {
    id: row.id,
    postId: row.post_id,
    anchor:
      row.quote_exact === null
        ? null
        : {
            exact: row.quote_exact,
            prefix: row.quote_prefix ?? "",
            suffix: row.quote_suffix ?? "",
            start: row.pos_start!,
            end: row.pos_end!,
          },
    resolved: row.resolved_at !== null,
    resolvedAt: iso(row.resolved_at),
    createdAt: iso(row.created_at)!,
    comments,
  };
}

function encodeCursor(row: ThreadRow): string {
  return btoa(`${row.created_at}:${row.id}`);
}

function decodeCursor(cursor: string): [number, string] {
  try {
    const [time, id] = atob(cursor).split(":");
    const created = Number(time);
    if (Number.isSafeInteger(created) && id) return [created, id];
  } catch {
    // 아래에서 400
  }
  throw new HttpError(400, "bad_request", "invalid cursor");
}

async function commentsFor(env: Env, threadIds: string[]) {
  const byThread = new Map<string, Comment[]>(threadIds.map((id) => [id, []]));
  if (threadIds.length === 0) return byThread;
  const { results } = await env.DB.prepare(
    `${COMMENT_SELECT} WHERE c.thread_id IN (${threadIds.map(() => "?").join(",")})
     ORDER BY c.created_at, c.id`,
  )
    .bind(...threadIds)
    .all<CommentRow>();
  for (const row of results)
    byThread.get(row.thread_id)!.push(toComment(env, row));
  return byThread;
}

/** GET /v1/posts/:postId/threads?cursor&limit — 오래된 순, 커서로 페이지를 나눈다. */
export async function listThreads(
  env: Env,
  postId: string,
  params: URLSearchParams,
): Promise<ThreadPage> {
  validatePostId(postId);
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? PAGE_DEFAULT : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_MAX) {
    throw new HttpError(400, "bad_request", `limit must be 1-${PAGE_MAX}`);
  }
  const cursor = params.get("cursor");
  const [afterTime, afterId] = cursor ? decodeCursor(cursor) : [-1, ""];
  const { results } = await env.DB.prepare(
    `SELECT * FROM threads WHERE post_id = ?1
       AND (created_at > ?2 OR (created_at = ?2 AND id > ?3))
     ORDER BY created_at, id LIMIT ?4`,
  )
    .bind(postId, afterTime, afterId, limit + 1)
    .all<ThreadRow>();
  const page = results.slice(0, limit);
  const comments = await commentsFor(
    env,
    page.map((row) => row.id),
  );
  return {
    threads: page.map((row) => toThread(row, comments.get(row.id)!)),
    nextCursor: results.length > limit ? encodeCursor(page.at(-1)!) : null,
  };
}

export function assertCanWrite(user: SessionUser) {
  if (user.banned) throw new HttpError(403, "banned", "user is banned");
}

/** 사용자당 10분에 10회. 관리자는 세지 않는다. */
export async function consumeWrite(env: Env, user: SessionUser): Promise<void> {
  if (user.isOwner) return;
  const now = Date.now();
  const since = now - RATE_WINDOW_MS;
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n, MIN(at) AS oldest FROM write_events WHERE user_id = ? AND at > ?",
  )
    .bind(user.id, since)
    .first<{ n: number; oldest: number | null }>();
  if (row && row.n >= RATE_LIMIT) {
    const retryAfter = Math.max(
      1,
      Math.ceil(((row.oldest ?? now) + RATE_WINDOW_MS - now) / 1000),
    );
    throw new HttpError(429, "rate_limited", "too many writes", {
      "Retry-After": String(retryAfter),
    });
  }
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM write_events WHERE user_id = ? AND at <= ?",
    ).bind(user.id, since),
    env.DB.prepare("INSERT INTO write_events (user_id, at) VALUES (?, ?)").bind(
      user.id,
      now,
    ),
  ]);
}

/** 처음 보는 글 id 는 SITE_URL 이 있으면 실제 페이지가 있는지 확인하고 posts 에 캐시한다. */
async function ensurePost(env: Env, postId: string): Promise<void> {
  const known = await env.DB.prepare("SELECT 1 FROM posts WHERE id = ?")
    .bind(postId)
    .first();
  if (known) return;
  if (env.SITE_URL) {
    const response = await fetch(
      `${env.SITE_URL.replace(/\/$/, "")}/posts/${postId}/`,
      { method: "HEAD", redirect: "manual" },
    );
    if (response.status !== 200)
      throw new HttpError(404, "invalid_post", "post does not exist");
  }
  await env.DB.prepare(
    "INSERT OR IGNORE INTO posts (id, created_at) VALUES (?, ?)",
  )
    .bind(postId, Date.now())
    .run();
}

async function getComment(env: Env, id: string): Promise<CommentRow> {
  const row = await env.DB.prepare(`${COMMENT_SELECT} WHERE c.id = ?`)
    .bind(id)
    .first<CommentRow>();
  if (!row) throw new HttpError(404, "not_found", "comment not found");
  return row;
}

async function getThread(env: Env, id: string): Promise<Thread> {
  const row = await env.DB.prepare("SELECT * FROM threads WHERE id = ?")
    .bind(id)
    .first<ThreadRow>();
  if (!row) throw new HttpError(404, "not_found", "thread not found");
  return toThread(row, (await commentsFor(env, [id])).get(id)!);
}

export async function createThread(
  env: Env,
  user: SessionUser,
  postId: string,
  input: unknown,
): Promise<Thread> {
  validatePostId(postId);
  const data = (input ?? {}) as Record<string, unknown>;
  const body = validateBody(data.body);
  const anchor = validateAnchor(data.anchor);
  assertCanWrite(user);
  await ensurePost(env, postId);
  await consumeWrite(env, user);
  const threadId = crypto.randomUUID();
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO threads (id, post_id, author_id, quote_exact, quote_prefix, quote_suffix, pos_start, pos_end, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      threadId,
      postId,
      user.id,
      anchor?.exact ?? null,
      anchor?.prefix ?? null,
      anchor?.suffix ?? null,
      anchor?.start ?? null,
      anchor?.end ?? null,
      now,
    ),
    env.DB.prepare(
      "INSERT INTO comments (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), threadId, user.id, body, now),
  ]);
  return getThread(env, threadId);
}

export async function reply(
  env: Env,
  user: SessionUser,
  threadId: string,
  input: unknown,
): Promise<Comment> {
  const body = validateBody(((input ?? {}) as Record<string, unknown>).body);
  assertCanWrite(user);
  await getThread(env, threadId);
  await consumeWrite(env, user);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO comments (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(id, threadId, user.id, body, Date.now())
    .run();
  return toComment(env, await getComment(env, id));
}

export async function resolveThread(
  env: Env,
  user: SessionUser,
  threadId: string,
  input: unknown,
): Promise<Thread> {
  const resolved = ((input ?? {}) as Record<string, unknown>).resolved;
  if (typeof resolved !== "boolean")
    throw new HttpError(400, "bad_request", "resolved must be a boolean");
  assertCanWrite(user);
  const row = await env.DB.prepare("SELECT author_id FROM threads WHERE id = ?")
    .bind(threadId)
    .first<{ author_id: number }>();
  if (!row) throw new HttpError(404, "not_found", "thread not found");
  if (row.author_id !== user.id && !user.isOwner) {
    throw new HttpError(403, "forbidden", "only the thread author or owner");
  }
  await consumeWrite(env, user);
  await env.DB.prepare(
    "UPDATE threads SET resolved_at = ?, resolved_by = ? WHERE id = ?",
  )
    .bind(resolved ? Date.now() : null, resolved ? user.id : null, threadId)
    .run();
  return getThread(env, threadId);
}

export async function editComment(
  env: Env,
  user: SessionUser,
  commentId: string,
  input: unknown,
): Promise<Comment> {
  const body = validateBody(((input ?? {}) as Record<string, unknown>).body);
  assertCanWrite(user);
  const row = await getComment(env, commentId);
  if (row.author_id !== user.id)
    throw new HttpError(403, "forbidden", "only the author can edit");
  if (row.deleted_at !== null)
    throw new HttpError(410, "gone", "comment was deleted");
  await consumeWrite(env, user);
  await env.DB.prepare(
    "UPDATE comments SET body = ?, edited_at = ? WHERE id = ?",
  )
    .bind(body, Date.now(), commentId)
    .run();
  return toComment(env, await getComment(env, commentId));
}

/** soft delete. 작성자나 관리자만. 이미 지운 댓글은 그대로 돌려준다. */
export async function deleteComment(
  env: Env,
  user: SessionUser,
  commentId: string,
): Promise<Comment> {
  const row = await getComment(env, commentId);
  if (row.author_id !== user.id && !user.isOwner)
    throw new HttpError(
      403,
      "forbidden",
      "only the author or owner can delete",
    );
  if (!user.isOwner) assertCanWrite(user);
  if (row.deleted_at !== null) return toComment(env, row);
  await consumeWrite(env, user);
  await env.DB.prepare(
    "UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE id = ?",
  )
    .bind(Date.now(), user.id, commentId)
    .run();
  return toComment(env, await getComment(env, commentId));
}

/** POST/DELETE /v1/admin/users/:id/ban — 관리자만. purge 면 그 사용자의 댓글을 모두 soft delete. */
export async function setBan(
  env: Env,
  user: SessionUser,
  targetId: number,
  banned: boolean,
  input: unknown,
): Promise<void> {
  if (!user.isOwner) throw new HttpError(403, "forbidden", "owner only");
  if (targetId === user.id)
    throw new HttpError(400, "bad_request", "cannot ban yourself");
  const purge = ((input ?? {}) as Record<string, unknown>).purge === true;
  const result = await env.DB.prepare(
    "UPDATE users SET banned = ? WHERE id = ?",
  )
    .bind(banned ? 1 : 0, targetId)
    .run();
  if (result.meta.changes === 0)
    throw new HttpError(404, "not_found", "user not found");
  if (banned && purge) {
    await env.DB.prepare(
      "UPDATE comments SET deleted_at = ?, deleted_by = ? WHERE author_id = ? AND deleted_at IS NULL",
    )
      .bind(Date.now(), user.id, targetId)
      .run();
  }
}
