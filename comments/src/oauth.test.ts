import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiError, MeResponse } from "./contract";
import { pkceChallenge } from "./crypto";
import { handle } from "./index";
import { api, authed, freshId, ORIGIN } from "./testing";

const DAY = 24 * 60 * 60 * 1000;
const RETURN_TO = `${ORIGIN}/posts/hello/`;

afterEach(() => {
  vi.restoreAllMocks();
});

async function startLogin(
  params: Record<string, string> = {},
): Promise<{ response: Response; state: string; challenge: string }> {
  const query = new URLSearchParams({
    origin: ORIGIN,
    mode: "popup",
    return_to: RETURN_TO,
    ...params,
  });
  const response = await api(`/v1/auth/start?${query}`);
  const location = new URL(response.headers.get("Location") ?? "about:blank");
  return {
    response,
    state: location.searchParams.get("state") ?? "",
    challenge: location.searchParams.get("code_challenge") ?? "",
  };
}

interface FakeGitHub {
  tokenBodies: Record<string, string>[];
}

function fakeGitHub(
  user: { id: number; login: string; created_at: string },
  tokenOk = true,
): FakeGitHub {
  const fake: FakeGitHub = { tokenBodies: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    if (request.url === "https://github.com/login/oauth/access_token") {
      fake.tokenBodies.push(await request.json());
      return Response.json(
        tokenOk
          ? { access_token: "gho_test" }
          : { error: "bad_verification_code" },
      );
    }
    if (request.url === "https://api.github.com/user") {
      expect(request.headers.get("Authorization")).toBe("Bearer gho_test");
      return Response.json({
        ...user,
        avatar_url: "https://avatars.example/a",
      });
    }
    throw new Error(`unexpected fetch ${request.url}`);
  });
  return fake;
}

const oldUser = (id: number) => ({
  id,
  login: `gh${id}`,
  created_at: new Date(Date.now() - 365 * DAY).toISOString(),
});

describe("GET /v1/auth/start", () => {
  it("redirects to GitHub with state and a PKCE S256 challenge", async () => {
    const { response, state, challenge } = await startLogin();
    expect(response.status).toBe(302);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(location.searchParams.get("client_id")).toBe("test-client");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://comments.test/v1/auth/callback",
    );
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const row = await env.DB.prepare(
      "SELECT code_verifier, origin, mode, return_to FROM oauth_states WHERE state = ?",
    )
      .bind(state)
      .first<{
        code_verifier: string;
        origin: string;
        mode: string;
        return_to: string;
      }>();
    expect(row).toMatchObject({
      origin: ORIGIN,
      mode: "popup",
      return_to: RETURN_TO,
    });
    expect(row!.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toBe(await pkceChallenge(row!.code_verifier));
    expect(challenge).not.toBe(row!.code_verifier);
  });

  it("refuses an origin outside the allowlist", async () => {
    const { response } = await startLogin({
      origin: "https://evil.example",
      return_to: "https://evil.example/",
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as ApiError).error.code).toBe(
      "origin_not_allowed",
    );
  });

  it("refuses a return_to on another origin", async () => {
    const { response } = await startLogin({
      return_to: "https://evil.example/",
    });
    expect(response.status).toBe(400);
  });

  it("is 503 not_configured without OAuth secrets", async () => {
    const response = await handle(
      new Request(`https://comments.test/v1/auth/start?origin=${ORIGIN}`),
      { ...env, GH_OAUTH_CLIENT_SECRET: undefined },
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as ApiError).error.code).toBe(
      "not_configured",
    );
  });
});

describe("GET /v1/auth/callback (popup)", () => {
  it("exchanges the code with the PKCE verifier and posts the token to the exact origin", async () => {
    const id = freshId();
    const { state } = await startLogin();
    const { code_verifier } = (await env.DB.prepare(
      "SELECT code_verifier FROM oauth_states WHERE state = ?",
    )
      .bind(state)
      .first<{ code_verifier: string }>())!;
    const github = fakeGitHub(oldUser(id));

    const response = await api(`/v1/auth/callback?code=abc&state=${state}`);
    expect(response.status).toBe(200);
    expect(github.tokenBodies).toEqual([
      {
        client_id: "test-client",
        client_secret: "test-secret",
        code: "abc",
        redirect_uri: "https://comments.test/v1/auth/callback",
        code_verifier,
      },
    ]);

    const csp = response.headers.get("Content-Security-Policy")!;
    const nonce = /script-src 'nonce-([A-Za-z0-9_-]+)'/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("unsafe-inline");
    const page = await response.text();
    expect(page).toContain(`<script nonce="${nonce}">`);
    expect(page).toContain(`postMessage(m,o)`);
    expect(page).toContain(`o=${JSON.stringify(ORIGIN)}`);
    expect(page).not.toContain(`"*"`);

    const token = /"token":"([A-Za-z0-9_-]+)"/.exec(page)?.[1];
    expect(token).toBeTruthy();
    expect(page).toContain(`#comments-token=${token}`); // opener 가 없을 때의 대체 경로
    const me = (await (
      await api("/v1/me", authed(token!))
    ).json()) as MeResponse;
    expect(me.user).toMatchObject({
      id,
      login: `gh${id}`,
      avatarUrl: "https://avatars.example/a",
    });
  });

  it("uses a fresh nonce per response", async () => {
    const nonces = new Set<string>();
    for (let i = 0; i < 2; i++) {
      const { state } = await startLogin();
      fakeGitHub(oldUser(freshId()));
      const response = await api(`/v1/auth/callback?code=c&state=${state}`);
      nonces.add(
        /nonce-([^']+)/.exec(
          response.headers.get("Content-Security-Policy")!,
        )![1]!,
      );
      vi.restoreAllMocks();
    }
    expect(nonces.size).toBe(2);
  });

  it("state is single-use", async () => {
    const { state } = await startLogin();
    fakeGitHub(oldUser(freshId()));
    expect((await api(`/v1/auth/callback?code=c&state=${state}`)).status).toBe(
      200,
    );
    const again = await api(`/v1/auth/callback?code=c&state=${state}`);
    expect(again.status).toBe(400);
    expect(await again.text()).toContain("invalid_state");
  });

  it("unknown or expired state is refused without calling GitHub", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect((await api("/v1/auth/callback?code=c&state=forged")).status).toBe(
      400,
    );
    const { state } = await startLogin();
    await env.DB.prepare(
      "UPDATE oauth_states SET expires_at = ? WHERE state = ?",
    )
      .bind(Date.now() - 1, state)
      .run();
    expect((await api(`/v1/auth/callback?code=c&state=${state}`)).status).toBe(
      400,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports account_too_new to the opener and issues no session", async () => {
    const id = freshId();
    const { state } = await startLogin();
    fakeGitHub({
      id,
      login: "fresh",
      created_at: new Date(Date.now() - DAY).toISOString(),
    });
    const page = await (
      await api(`/v1/auth/callback?code=c&state=${state}`)
    ).text();
    expect(page).toContain(`"error":"account_too_new"`);
    expect(page).not.toContain(`"token"`);
    const sessions = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(sessions?.n).toBe(0);
  });

  it("reports oauth_failed when GitHub refuses the code or the user denies access", async () => {
    const { state } = await startLogin();
    fakeGitHub(oldUser(freshId()), false);
    expect(
      await (await api(`/v1/auth/callback?code=bad&state=${state}`)).text(),
    ).toContain(`"error":"oauth_failed"`);
    const denied = await startLogin();
    expect(
      await (
        await api(`/v1/auth/callback?error=access_denied&state=${denied.state}`)
      ).text(),
    ).toContain(`"error":"oauth_failed"`);
  });
});

describe("GET /v1/auth/callback (redirect fallback)", () => {
  it("redirects back to return_to with #comments-token", async () => {
    const id = freshId();
    const { state } = await startLogin({
      mode: "redirect",
      return_to: `${RETURN_TO}#old`,
    });
    fakeGitHub(oldUser(id));
    const response = await api(`/v1/auth/callback?code=c&state=${state}`);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin + location.pathname).toBe(RETURN_TO);
    const token = /^#comments-token=([A-Za-z0-9_-]+)$/.exec(location.hash)?.[1];
    expect(token).toBeTruthy();
    expect((await api("/v1/me", authed(token!))).status).toBe(200);
  });

  it("redirects with #comments-error on failure", async () => {
    const { state } = await startLogin({ mode: "redirect" });
    fakeGitHub({
      id: freshId(),
      login: "n",
      created_at: new Date().toISOString(),
    });
    const response = await api(`/v1/auth/callback?code=c&state=${state}`);
    expect(new URL(response.headers.get("Location")!).hash).toBe(
      "#comments-error=account_too_new",
    );
  });
});
