import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import type { ApiError, Health } from "./contract";
import { handle } from "./index";
import { api, freshId, login, ORIGIN, post } from "./testing";

describe("health", () => {
  it("answers with mode", async () => {
    const response = await api("/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      mode: "readwrite",
    } satisfies Health);
  });
});

describe("routing", () => {
  it("unknown path is 404 with the error shape", async () => {
    const response = await api("/v1/nope");
    expect(response.status).toBe(404);
    const body = (await response.json()) as ApiError;
    expect(body.error.code).toBe("not_found");
    expect(typeof body.error.message).toBe("string");
  });

  it("wrong method on a known path is 405", async () => {
    const response = await api("/v1/health", { method: "POST", body: "{}" });
    expect(response.status).toBe(405);
    expect(((await response.json()) as ApiError).error.code).toBe(
      "method_not_allowed",
    );
  });

  it("malformed JSON is 400 bad_request", async () => {
    const token = await login(freshId());
    const response = await api("/v1/posts/a-post/threads", {
      method: "POST",
      body: "{nope",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiError).error.code).toBe(
      "bad_request",
    );
  });
});

describe("CORS allowlist", () => {
  it("echoes an allowed origin and varies on Origin", async () => {
    const response = await api("/v1/health");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Vary")).toContain("Origin");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });

  it("answers an allowed preflight with methods and headers", async () => {
    const response = await api("/v1/posts/a/threads", {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "PATCH",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toMatch(
      /Authorization/,
    );
  });

  it("refuses a preflight from another origin", async () => {
    const response = await api("/v1/posts/a/threads", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("does not grant CORS to another origin on reads", async () => {
    const response = await api("/v1/health", {
      headers: { Origin: "https://evil.example" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects writes from another origin before touching data", async () => {
    const token = await login(freshId());
    const response = await api(
      "/v1/posts/cors-post/threads",
      post({ body: "hi" }, token, "POST"),
    );
    expect(response.status).toBe(201);
    const evil = await api("/v1/posts/cors-post/threads", {
      ...post({ body: "hi" }, token),
      headers: {
        Origin: "https://evil.example",
        Authorization: `Bearer ${token}`,
      },
    });
    expect(evil.status).toBe(403);
    expect(((await evil.json()) as ApiError).error.code).toBe(
      "origin_not_allowed",
    );
  });

  it("prefix-matching origins are not allowed", async () => {
    const response = await api("/v1/health", {
      headers: { Origin: `${ORIGIN}.evil.example` },
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("readonly mode", () => {
  const readonly = { ...env, MODE: "readonly" };
  const call = (path: string, init: RequestInit = {}) =>
    handle(
      new Request(`https://comments.test${path}`, {
        ...init,
        headers: { Origin: ORIGIN, ...(init.headers as object) },
      }),
      readonly,
    );

  it("reports readonly in health", async () => {
    expect(await (await call("/v1/health")).json()).toEqual({
      ok: true,
      mode: "readonly",
    });
  });

  it("blocks every write route with 503 readonly but keeps reads", async () => {
    const token = await login(freshId());
    const auth = { Authorization: `Bearer ${token}` };
    const writes: [string, string][] = [
      ["POST", "/v1/posts/ro-post/threads"],
      ["POST", "/v1/threads/t1/comments"],
      ["POST", "/v1/threads/t1/resolve"],
      ["PATCH", "/v1/comments/c1"],
      ["DELETE", "/v1/comments/c1"],
      ["POST", "/v1/admin/users/5/ban"],
      ["DELETE", "/v1/admin/users/5/ban"],
    ];
    for (const [method, path] of writes) {
      const response = await call(path, {
        method,
        headers: auth,
        body: method === "DELETE" ? undefined : JSON.stringify({ body: "x" }),
      });
      expect(response.status, `${method} ${path}`).toBe(503);
      expect(((await response.json()) as ApiError).error.code).toBe("readonly");
    }
    expect((await call("/v1/posts/ro-post/threads")).status).toBe(200);
    expect((await call("/v1/me", { headers: auth })).status).toBe(200);
  });
});
