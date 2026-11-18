// 시험 파일들이 함께 쓰는 도우미. 워커 번들에는 들어가지 않는다(index.ts 가 import 하지 않는다).
import { exports } from "cloudflare:workers";

export const ORIGIN = "http://localhost:4321";
export const OWNER_ID = 1; // wrangler.jsonc env.test 의 OWNER_GITHUB_ID

export function api(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Origin")) headers.set("Origin", ORIGIN);
  if (init.body !== undefined && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  return exports.default.fetch(
    new Request(`https://comments.test${path}`, {
      ...init,
      headers,
      redirect: "manual",
    }),
  );
}

export function authed(token: string, init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

export function post(
  body: unknown,
  token?: string,
  method = "POST",
): RequestInit {
  const init: RequestInit = { method, body: JSON.stringify(body) };
  return token ? authed(token, init) : init;
}

export async function login(
  id: number,
  name = `user${id}`,
  createdAt?: string,
): Promise<string> {
  const response = await api(
    "/v1/auth/test-login",
    post({ id, login: name, createdAt }),
  );
  if (response.status !== 200)
    throw new Error(
      `login failed: ${response.status} ${await response.text()}`,
    );
  return ((await response.json()) as { token: string }).token;
}

let counter = 0;
/** 시험마다 겹치지 않는 사용자 id(관리자 1 과 겹치지 않게 1000 부터). */
export function freshId(): number {
  counter += 1;
  return 1000 + counter;
}
