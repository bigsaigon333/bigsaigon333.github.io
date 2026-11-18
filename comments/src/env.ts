import type { Mode } from "./contract";

/** wrangler.jsonc 의 vars, d1_databases 와 secret 으로 들어오는 값. README 의 "환경 변수" 참고. */
export interface Env {
  DB: D1Database;
  /** 쉼표로 나눈 정확한 출처 목록. 예: "https://example.github.io,http://localhost:4321" */
  ALLOWED_ORIGINS?: string;
  /** "readonly" 면 쓰기를 모두 503 으로 막는다. 그 밖의 값은 readwrite. */
  MODE?: string;
  /** 관리자 GitHub 숫자 id. 비어 있으면 관리자가 없다. */
  OWNER_GITHUB_ID?: string;
  /** GitHub OAuth App. 둘 다 secret. 없으면 /v1/auth/start 가 503 not_configured. */
  GH_OAUTH_CLIENT_ID?: string;
  GH_OAUTH_CLIENT_SECRET?: string;
  /** "1" 일 때만 POST /v1/auth/test-login 이 열린다. 운영 환경에는 절대 넣지 않는다. */
  TEST_LOGIN?: string;
  /** 있으면 처음 보는 글 id 를 `${SITE_URL}/posts/<id>/` 에 HEAD 로 확인한다. 없으면 형식만 본다. */
  SITE_URL?: string;
}

export function allowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function mode(env: Env): Mode {
  return env.MODE === "readonly" ? "readonly" : "readwrite";
}

export function ownerId(env: Env): number | null {
  const id = Number(env.OWNER_GITHUB_ID);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
