import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ApiError, MeResponse } from "./contract";
import { sha256Hex } from "./crypto";
import { handle } from "./index";
import { api, authed, freshId, login, ORIGIN, OWNER_ID, post } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

describe("POST /v1/auth/test-login", () => {
  it("issues a token that /v1/me accepts", async () => {
    const id = freshId();
    const token = await login(id, "alice");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const response = await api("/v1/me", authed(token));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      user: { id, login: "alice", avatarUrl: "", isOwner: false },
      banned: false,
    } satisfies MeResponse);
  });

  it("marks OWNER_GITHUB_ID as owner", async () => {
    const token = await login(OWNER_ID, "owner");
    const me = (await (
      await api("/v1/me", authed(token))
    ).json()) as MeResponse;
    expect(me.user.isOwner).toBe(true);
  });

  it("stores only the sha256 of the token", async () => {
    const id = freshId();
    const token = await login(id);
    const rows = await env.DB.prepare(
      "SELECT token_hash FROM sessions WHERE user_id = ?",
    )
      .bind(id)
      .all<{ token_hash: string }>();
    expect(rows.results.map((row) => row.token_hash)).toEqual([
      await sha256Hex(token),
    ]);
  });

  it("is 404 unless TEST_LOGIN=1", async () => {
    const response = await handle(
      new Request("https://comments.test/v1/auth/test-login", {
        method: "POST",
        headers: { Origin: ORIGIN },
        body: JSON.stringify({ id: freshId(), login: "x" }),
      }),
      { ...env, TEST_LOGIN: undefined },
    );
    expect(response.status).toBe(404);
  });

  it("rejects bad input", async () => {
    for (const body of [{}, { id: -1, login: "a" }, { id: 5, login: "a b" }]) {
      const response = await api("/v1/auth/test-login", post(body));
      expect(response.status).toBe(400);
    }
  });
});

describe("account age rule", () => {
  it("refuses accounts younger than 7 days", async () => {
    const response = await api(
      "/v1/auth/test-login",
      post({
        id: freshId(),
        login: "newbie",
        createdAt: new Date(Date.now() - 6 * DAY).toISOString(),
      }),
    );
    expect(response.status).toBe(403);
    expect(((await response.json()) as ApiError).error.code).toBe(
      "account_too_new",
    );
  });

  it("accepts accounts older than 7 days", async () => {
    await expect(
      login(freshId(), "elder", new Date(Date.now() - 8 * DAY).toISOString()),
    ).resolves.toBeTruthy();
  });

  it("refuses an unparseable creation date", async () => {
    const response = await api(
      "/v1/auth/test-login",
      post({ id: freshId(), login: "x", createdAt: "not a date" }),
    );
    expect(response.status).toBe(403);
  });
});

describe("sessions", () => {
  it("/v1/me without a token is 401 unauthorized", async () => {
    const response = await api("/v1/me");
    expect(response.status).toBe(401);
    expect(((await response.json()) as ApiError).error.code).toBe(
      "unauthorized",
    );
  });

  it("an unknown token is 401", async () => {
    const response = await api("/v1/me", authed("x".repeat(43)));
    expect(response.status).toBe(401);
  });

  it("an expired session is 401 session_expired and removed", async () => {
    const id = freshId();
    const token = await login(id);
    await env.DB.prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
      .bind(Date.now() - 1, id)
      .run();
    const response = await api("/v1/me", authed(token));
    expect(response.status).toBe(401);
    expect(((await response.json()) as ApiError).error.code).toBe(
      "session_expired",
    );
    const left = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("sessions last 30 days", async () => {
    const id = freshId();
    const before = Date.now();
    await login(id);
    const row = await env.DB.prepare(
      "SELECT expires_at FROM sessions WHERE user_id = ?",
    )
      .bind(id)
      .first<{ expires_at: number }>();
    expect(row!.expires_at - before).toBeGreaterThanOrEqual(30 * DAY);
    expect(row!.expires_at - before).toBeLessThan(30 * DAY + 60_000);
  });

  it("logout revokes the token", async () => {
    const token = await login(freshId());
    const response = await api(
      "/v1/auth/logout",
      authed(token, { method: "POST" }),
    );
    expect(response.status).toBe(204);
    expect((await api("/v1/me", authed(token))).status).toBe(401);
  });
});
