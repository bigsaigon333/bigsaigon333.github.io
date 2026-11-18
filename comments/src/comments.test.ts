import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RATE_LIMIT,
  type Anchor,
  type ApiError,
  type Comment,
  type MeResponse,
  type Thread,
  type ThreadPage,
} from "./contract";
import { handle } from "./index";
import { api, authed, freshId, login, ORIGIN, OWNER_ID, post } from "./testing";

let postCounter = 0;
const freshPost = () => `post-${++postCounter}`;

const anchor: Anchor = {
  exact: "본문의 한 문장",
  prefix: "앞",
  suffix: "뒤",
  start: 10,
  end: 17,
};

async function code(response: Response) {
  return ((await response.json()) as ApiError).error.code;
}

async function createThread(
  token: string,
  postId: string,
  body: Record<string, unknown> = { body: "첫 댓글" },
): Promise<Thread> {
  const response = await api(`/v1/posts/${postId}/threads`, post(body, token));
  expect(response.status).toBe(201);
  return (await response.json()) as Thread;
}

async function list(postId: string, query = ""): Promise<ThreadPage> {
  const response = await api(`/v1/posts/${postId}/threads${query}`);
  expect(response.status).toBe(200);
  return (await response.json()) as ThreadPage;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /v1/posts/:id/threads", () => {
  it("is empty for a post without comments, cacheable for 30s", async () => {
    const response = await api(`/v1/posts/${freshPost()}/threads`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=30");
    expect(await response.json()).toEqual({ threads: [], nextCursor: null });
  });

  it("rejects an invalid post id", async () => {
    const response = await api("/v1/posts/Bad_Id/threads");
    expect(response.status).toBe(404); // 경로 패턴에 맞지 않는다
    const upper = await api("/v1/posts/UPPER/threads");
    expect(upper.status).toBe(400);
    expect(await code(upper)).toBe("invalid_post");
  });

  it("pages with a cursor in creation order", async () => {
    const token = await login(OWNER_ID, "owner"); // 관리자는 요청 수 제한을 받지 않는다
    const postId = freshPost();
    const created: string[] = [];
    for (let i = 0; i < 5; i++) {
      created.push((await createThread(token, postId, { body: `n${i}` })).id);
    }
    const first = await list(postId, "?limit=2");
    expect(first.threads.map((thread) => thread.id)).toEqual(
      created.slice(0, 2),
    );
    expect(first.nextCursor).toBeTruthy();
    const second = await list(
      postId,
      `?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`,
    );
    expect(second.threads.map((thread) => thread.id)).toEqual(
      created.slice(2, 4),
    );
    const third = await list(
      postId,
      `?limit=2&cursor=${encodeURIComponent(second.nextCursor!)}`,
    );
    expect(third.threads.map((thread) => thread.id)).toEqual(created.slice(4));
    expect(third.nextCursor).toBeNull();
  });

  it("rejects a bad limit or cursor", async () => {
    expect((await api(`/v1/posts/x/threads?limit=0`)).status).toBe(400);
    expect((await api(`/v1/posts/x/threads?limit=101`)).status).toBe(400);
    expect((await api(`/v1/posts/x/threads?cursor=%%%`)).status).toBe(400);
  });
});

describe("POST /v1/posts/:id/threads", () => {
  it("requires login", async () => {
    const response = await api(
      `/v1/posts/${freshPost()}/threads`,
      post({ body: "x" }),
    );
    expect(response.status).toBe(401);
  });

  it("creates an anchored thread and lists it", async () => {
    const id = freshId();
    const token = await login(id, "writer");
    const postId = freshPost();
    const thread = await createThread(token, postId, {
      anchor,
      body: "  좋은 문장  ",
    });
    expect(thread).toMatchObject({
      postId,
      anchor,
      resolved: false,
      resolvedAt: null,
      comments: [
        {
          body: "좋은 문장",
          deleted: false,
          editedAt: null,
          author: { id, login: "writer", isOwner: false },
        },
      ],
    });
    expect((await list(postId)).threads).toEqual([thread]);
  });

  it("creates a whole-post thread with a null anchor", async () => {
    const token = await login(freshId());
    const thread = await createThread(token, freshPost(), { body: "글 전체" });
    expect(thread.anchor).toBeNull();
  });

  it("validates body length (1-4000 code points) and control characters", async () => {
    const token = await login(OWNER_ID, "owner");
    const postId = freshPost();
    for (const body of ["", "   ", "a".repeat(4001), "a\u0000b", 5]) {
      const response = await api(
        `/v1/posts/${postId}/threads`,
        post({ body }, token),
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await code(response)).toBe("invalid_body");
    }
    await createThread(token, postId, { body: "가".repeat(4000) });
    await createThread(token, postId, { body: "😀".repeat(4000) });
    await createThread(token, postId, { body: "줄\n바꿈\t탭" });
  });

  it("validates the anchor", async () => {
    const token = await login(OWNER_ID, "owner");
    const bad = [
      { ...anchor, exact: "" },
      { ...anchor, prefix: "a".repeat(33) },
      { ...anchor, suffix: 3 },
      { ...anchor, start: 5, end: 5 },
      { ...anchor, start: -1 },
      { ...anchor, end: 1.5 },
      "string",
    ];
    for (const value of bad) {
      const response = await api(
        `/v1/posts/${freshPost()}/threads`,
        post({ body: "x", anchor: value }, token),
      );
      expect(response.status, JSON.stringify(value)).toBe(400);
      expect(await code(response)).toBe("invalid_anchor");
    }
  });

  it("checks that the post exists on SITE_URL once and caches it", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        return new Response(null, {
          status: url.endsWith("/posts/real-post/") ? 200 : 404,
        });
      });
    const withSite = { ...env, SITE_URL: "https://blog.example" };
    const token = await login(freshId());
    const call = (postId: string) =>
      handle(
        new Request(`https://comments.test/v1/posts/${postId}/threads`, {
          method: "POST",
          headers: { Origin: ORIGIN, Authorization: `Bearer ${token}` },
          body: JSON.stringify({ body: "x" }),
        }),
        withSite,
      );
    const missing = await call("ghost-post");
    expect(missing.status).toBe(404);
    expect(await code(missing)).toBe("invalid_post");
    expect((await call("real-post")).status).toBe(201);
    expect((await call("real-post")).status).toBe(201);
    const realCalls = fetchSpy.mock.calls.filter(([input]) =>
      String(input).endsWith("/posts/real-post/"),
    );
    expect(realCalls).toHaveLength(1);
  });
});

describe("replies, edit, delete, resolve", () => {
  it("replies in order", async () => {
    const a = await login(freshId());
    const b = await login(freshId());
    const thread = await createThread(a, freshPost());
    const response = await api(
      `/v1/threads/${thread.id}/comments`,
      post({ body: "답글" }, b),
    );
    expect(response.status).toBe(201);
    const reply = (await response.json()) as Comment;
    expect(reply.threadId).toBe(thread.id);
    const [listed] = (await list(thread.postId)).threads;
    expect(listed!.comments.map((comment) => comment.body)).toEqual([
      "첫 댓글",
      "답글",
    ]);
  });

  it("reply to an unknown thread is 404", async () => {
    const token = await login(freshId());
    const response = await api(
      "/v1/threads/does-not-exist/comments",
      post({ body: "x" }, token),
    );
    expect(response.status).toBe(404);
  });

  it("only the author edits; edits set editedAt", async () => {
    const a = await login(freshId());
    const b = await login(freshId());
    const owner = await login(OWNER_ID, "owner");
    const thread = await createThread(a, freshPost());
    const commentId = thread.comments[0]!.id;
    const path = `/v1/comments/${commentId}`;
    expect(
      (await api(path, post({ body: "남의 것" }, b, "PATCH"))).status,
    ).toBe(403);
    expect(
      (await api(path, post({ body: "관리자" }, owner, "PATCH"))).status,
    ).toBe(403);
    const response = await api(path, post({ body: "고친 글" }, a, "PATCH"));
    expect(response.status).toBe(200);
    const edited = (await response.json()) as Comment;
    expect(edited.body).toBe("고친 글");
    expect(edited.editedAt).not.toBeNull();
    expect((await api(path, post({ body: "" }, a, "PATCH"))).status).toBe(400);
  });

  it("soft delete hides the body, keeps the row, blocks edits", async () => {
    const a = await login(freshId());
    const b = await login(freshId());
    const thread = await createThread(a, freshPost());
    const commentId = thread.comments[0]!.id;
    const path = `/v1/comments/${commentId}`;
    expect((await api(path, authed(b, { method: "DELETE" }))).status).toBe(403);
    const response = await api(path, authed(a, { method: "DELETE" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ deleted: true, body: "" });
    const [listed] = (await list(thread.postId)).threads;
    expect(listed!.comments[0]).toMatchObject({
      id: commentId,
      deleted: true,
      body: "",
    });
    const row = await env.DB.prepare(
      "SELECT body, deleted_by FROM comments WHERE id = ?",
    )
      .bind(commentId)
      .first<{ body: string; deleted_by: number }>();
    expect(row?.body).toBe("첫 댓글");
    const edit = await api(path, post({ body: "되살리기" }, a, "PATCH"));
    expect(edit.status).toBe(410);
    expect(await code(edit)).toBe("gone");
    // 다시 지워도 같은 결과(멱등)
    expect((await api(path, authed(a, { method: "DELETE" }))).status).toBe(200);
  });

  it("owner can delete anyone's comment", async () => {
    const a = await login(freshId());
    const owner = await login(OWNER_ID, "owner");
    const thread = await createThread(a, freshPost());
    const response = await api(
      `/v1/comments/${thread.comments[0]!.id}`,
      authed(owner, { method: "DELETE" }),
    );
    expect(response.status).toBe(200);
    const row = await env.DB.prepare(
      "SELECT deleted_by FROM comments WHERE id = ?",
    )
      .bind(thread.comments[0]!.id)
      .first<{ deleted_by: number }>();
    expect(row?.deleted_by).toBe(OWNER_ID);
  });

  it("thread author and owner resolve; others cannot", async () => {
    const a = await login(freshId());
    const b = await login(freshId());
    const owner = await login(OWNER_ID, "owner");
    const thread = await createThread(a, freshPost());
    const path = `/v1/threads/${thread.id}/resolve`;
    expect((await api(path, post({ resolved: true }, b))).status).toBe(403);
    expect((await api(path, post({ resolved: "yes" }, a))).status).toBe(400);
    const resolved = (await (
      await api(path, post({ resolved: true }, a))
    ).json()) as Thread;
    expect(resolved.resolved).toBe(true);
    expect(resolved.resolvedAt).not.toBeNull();
    const reopened = (await (
      await api(path, post({ resolved: false }, owner))
    ).json()) as Thread;
    expect(reopened).toMatchObject({ resolved: false, resolvedAt: null });
    expect(
      (await api("/v1/threads/nope/resolve", post({ resolved: true }, a)))
        .status,
    ).toBe(404);
  });
});

describe("rate limit", () => {
  it(`allows ${RATE_LIMIT} writes per 10 minutes, then 429 with Retry-After`, async () => {
    const token = await login(freshId());
    const postId = freshPost();
    for (let i = 0; i < RATE_LIMIT; i++) {
      await createThread(token, postId, { body: `w${i}` });
    }
    const response = await api(
      `/v1/posts/${postId}/threads`,
      post({ body: "over" }, token),
    );
    expect(response.status).toBe(429);
    expect(await code(response)).toBe("rate_limited");
    const retryAfter = Number(response.headers.get("Retry-After"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(600);
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain(
      "Retry-After",
    );
    // 다른 쓰기 종류도 같은 한도를 쓴다
    const thread = (await list(postId)).threads[0]!;
    expect(
      (
        await api(
          `/v1/threads/${thread.id}/comments`,
          post({ body: "r" }, token),
        )
      ).status,
    ).toBe(429);
  });

  it("forgets writes older than the window", async () => {
    const id = freshId();
    const token = await login(id);
    const old = Date.now() - 11 * 60 * 1000;
    await env.DB.batch(
      Array.from({ length: RATE_LIMIT }, () =>
        env.DB.prepare(
          "INSERT INTO write_events (user_id, at) VALUES (?, ?)",
        ).bind(id, old),
      ),
    );
    await createThread(token, freshPost());
  });

  it("the owner is exempt", async () => {
    const owner = await login(OWNER_ID, "owner");
    const postId = freshPost();
    for (let i = 0; i < RATE_LIMIT + 2; i++) {
      await createThread(owner, postId, { body: `o${i}` });
    }
  });

  it("rejected (invalid) writes do not count", async () => {
    const token = await login(freshId());
    const postId = freshPost();
    for (let i = 0; i < RATE_LIMIT + 2; i++) {
      await api(`/v1/posts/${postId}/threads`, post({ body: "" }, token));
    }
    await createThread(token, postId);
  });
});

describe("owner moderation: ban", () => {
  it("only the owner can ban", async () => {
    const id = freshId();
    await login(id);
    const other = await login(freshId());
    const response = await api(`/v1/admin/users/${id}/ban`, post({}, other));
    expect(response.status).toBe(403);
    expect(await code(response)).toBe("forbidden");
  });

  it("banned users can read but not write; unban restores", async () => {
    const id = freshId();
    const token = await login(id);
    const owner = await login(OWNER_ID, "owner");
    const postId = freshPost();
    const thread = await createThread(token, postId);
    expect(
      (await api(`/v1/admin/users/${id}/ban`, post({}, owner))).status,
    ).toBe(204);

    const me = (await (
      await api("/v1/me", authed(token))
    ).json()) as MeResponse;
    expect(me.banned).toBe(true);
    const attempts = [
      api(`/v1/posts/${postId}/threads`, post({ body: "x" }, token)),
      api(`/v1/threads/${thread.id}/comments`, post({ body: "x" }, token)),
      api(`/v1/threads/${thread.id}/resolve`, post({ resolved: true }, token)),
      api(
        `/v1/comments/${thread.comments[0]!.id}`,
        post({ body: "x" }, token, "PATCH"),
      ),
      api(
        `/v1/comments/${thread.comments[0]!.id}`,
        authed(token, { method: "DELETE" }),
      ),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403);
      expect(await code(response)).toBe("banned");
    }
    expect((await list(postId)).threads).toHaveLength(1);

    expect(
      (
        await api(
          `/v1/admin/users/${id}/ban`,
          authed(owner, { method: "DELETE" }),
        )
      ).status,
    ).toBe(204);
    await createThread(token, postId);
  });

  it("purge soft-deletes all of the user's comments", async () => {
    const id = freshId();
    const token = await login(id);
    const owner = await login(OWNER_ID, "owner");
    const postId = freshPost();
    await createThread(token, postId, { body: "스팸1" });
    await createThread(token, postId, { body: "스팸2" });
    await api(`/v1/admin/users/${id}/ban`, post({ purge: true }, owner));
    const page = await list(postId);
    expect(
      page.threads.flatMap((thread) => thread.comments.map((c) => c.deleted)),
    ).toEqual([true, true]);
  });

  it("unknown user is 404; the owner cannot ban themselves", async () => {
    const owner = await login(OWNER_ID, "owner");
    expect(
      (await api("/v1/admin/users/999999/ban", post({}, owner))).status,
    ).toBe(404);
    expect(
      (await api(`/v1/admin/users/${OWNER_ID}/ban`, post({}, owner))).status,
    ).toBe(400);
  });
});
