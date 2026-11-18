# comments 워커

블로그 인라인 댓글 API. Cloudflare Workers + D1, GitHub OAuth(팝업, state + PKCE S256), bearer 토큰.
요청·응답 타입은 [`src/contract.ts`](src/contract.ts)가 정답이다. 클라이언트는 이 파일을 import 해서 쓴다.

```sh
npm --prefix comments ci            # 루트 workspace 로 묶이기 전까지
npm --prefix comments test          # vitest + @cloudflare/vitest-plugin(workerd 안, 로컬 D1)
npm --prefix comments run typecheck
npm --prefix comments run dev       # 로컬 D1 마이그레이션 → wrangler dev --env test (http://localhost:8787)
```

## 엔드포인트 (`/v1`)

오류는 모두 `{ "error": { "code": ErrorCode, "message": string } }`이다. 인증은 `Authorization: Bearer <token>`.

| 메서드와 경로                    | 인증                 | 설명                                                                                               |
| -------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /v1/health`                 | -                    | `{ ok: true, mode }`                                                                               |
| `GET /v1/posts/:postId/threads`  | -                    | `ThreadPage`. `?limit=1..100`(기본 50), `?cursor=`. 오래된 순. `Cache-Control: public, max-age=30` |
| `POST /v1/posts/:postId/threads` | 필요, 쓰기           | `{ anchor?: Anchor \| null, body }` → 201 `Thread`. anchor 가 없으면 글 전체 thread                |
| `POST /v1/threads/:id/comments`  | 필요, 쓰기           | `{ body }` → 201 `Comment`                                                                         |
| `POST /v1/threads/:id/resolve`   | thread 작성자·관리자 | `{ resolved: boolean }` → `Thread`                                                                 |
| `PATCH /v1/comments/:id`         | 작성자               | `{ body }` → `Comment`(`editedAt` 갱신). 지운 댓글은 410 `gone`                                    |
| `DELETE /v1/comments/:id`        | 작성자·관리자        | soft delete → `Comment`(`deleted: true`, `body: ""`). 다시 불러도 200                              |
| `GET /v1/me`                     | 필요                 | `{ user, banned }`                                                                                 |
| `POST /v1/auth/logout`           | 선택                 | 204. 그 토큰의 세션을 지운다                                                                       |
| `GET /v1/auth/start`             | -                    | `?origin=<허용 출처>&mode=popup\|redirect&return_to=<origin 안의 URL>` → GitHub 로 302             |
| `GET /v1/auth/callback`          | -                    | GitHub 가 돌아오는 곳. 아래 "로그인 흐름"                                                          |
| `POST /v1/auth/test-login`       | -                    | **`TEST_LOGIN=1` 일 때만.** `{ id, login, createdAt? }` → `{ token }`. 아니면 404                  |
| `POST /v1/admin/users/:id/ban`   | 관리자               | `{ purge?: boolean }` → 204. purge 면 그 사용자의 댓글을 모두 soft delete                          |
| `DELETE /v1/admin/users/:id/ban` | 관리자               | 차단 해제 → 204                                                                                    |

규칙

- **본문**: 앞뒤 공백을 뺀 평문 1–4000자(코드 포인트). `\r\n`은 `\n`으로. 줄바꿈·탭 말고 제어 문자는 400 `invalid_body`. 클라이언트는 `textContent`로만 그린다.
- **anchor**: `exact` 1–1000자, `prefix`·`suffix` 32자 이하, `0 <= start < end` 정수. 아니면 400 `invalid_anchor`.
- **글 id**: `^[a-z0-9]+(-[a-z0-9]+)*$`. `SITE_URL`이 있으면 처음 보는 id 는 `${SITE_URL}/posts/<id>/`에 HEAD 해서 200 일 때만 받고 `posts` 테이블에 캐시한다.
- **요청 수 제한**: 쓰기(thread, 답글, resolve, 수정, 삭제)는 사용자당 10분에 10회. 넘으면 429 `rate_limited` + `Retry-After`(초). 검증에 실패한 요청은 세지 않는다. 관리자는 제외.
- **계정 나이**: GitHub 가입 7일 미만이면 로그인 단계에서 403 `account_too_new`.
- **차단**: 차단된 사용자는 읽기와 `me`만 된다. 쓰기는 403 `banned`.
- **세션**: 토큰은 32바이트 난수(base64url 43자). D1 에는 sha256 만 둔다. 30일 뒤 401 `session_expired`.
- **readonly**: `MODE=readonly`면 위 표의 쓰기·관리자 경로가 503 `readonly`. 읽기, 로그인, 로그아웃은 된다.
- **CORS**: `ALLOWED_ORIGINS`와 정확히 같은 출처에만 `Access-Control-Allow-Origin`을 준다. 쿠키를 쓰지 않으므로 credentials 는 없다. 목록 밖 출처의 쓰기(`Origin` 헤더가 있는 GET 외 요청)는 403 `origin_not_allowed`.
- **캐시**: 목록은 30초 캐시된다. 클라이언트는 자기 쓰기 직후에는 `fetch(url, { cache: "no-cache" })`로 다시 받거나 응답을 직접 합친다.

## 로그인 흐름

1. 클라이언트가 `window.open(`${API}/v1/auth/start?origin=${location.origin}&mode=popup&return_to=${location.href}`)`.
2. 워커가 state 와 PKCE verifier 를 D1(`oauth_states`, 10분, 한 번만 사용)에 두고 GitHub 로 302.
3. callback 이 code 를 verifier 와 함께 바꾸고, `/user`로 계정을 읽고, 7일 규칙을 본 뒤 세션을 만든다.
4. **popup**: CSP `default-src 'none'; script-src 'nonce-…'` 페이지가 `window.opener.postMessage({ type: "comments:auth", token }, origin)` 후 창을 닫는다. 실패면 `{ type, error }`. 대상 origin 은 start 때 받은 정확한 출처다(`"*"` 아님). 클라이언트는 `event.origin === API 출처`와 `event.data.type`을 확인한다.
5. **opener 가 없으면**(팝업 차단·COOP 등) 같은 창이 `return_to#comments-token=<token>`(실패면 `#comments-error=<code>`)로 이동한다. `mode=redirect`는 처음부터 이 302 를 쓴다. 클라이언트는 fragment 를 읽어 localStorage 에 넣고 `history.replaceState`로 지운다. 같은 출처의 다른 탭은 `storage` 이벤트로 알게 된다.

## 환경 변수

| 이름                     | 종류   | 설명                                                                           |
| ------------------------ | ------ | ------------------------------------------------------------------------------ |
| `DB`                     | D1     | 바인딩. 스키마는 `migrations/`(추가만 한다)                                    |
| `ALLOWED_ORIGINS`        | var    | 쉼표로 나눈 정확한 출처 목록                                                   |
| `MODE`                   | var    | `readwrite`(기본) 또는 `readonly`                                              |
| `SITE_URL`               | var    | 글 존재 확인용 사이트 주소. 비우면 형식만 본다                                 |
| `OWNER_GITHUB_ID`        | var    | 관리자 GitHub 숫자 id. 없으면 관리자가 없다                                    |
| `GH_OAUTH_CLIENT_ID`     | secret | GitHub OAuth App. 없으면 `/v1/auth/start`가 503 `not_configured`               |
| `GH_OAUTH_CLIENT_SECRET` | secret | 〃                                                                             |
| `TEST_LOGIN`             | var    | `"1"`일 때만 `POST /v1/auth/test-login`이 열린다. **운영(default env)에 없다** |

`wrangler.jsonc`에는 secret 도 실제 `database_id`도 없다. `database_id`는 `00000000-…` 자리 표시자이고 배포 CI 가 바꾼다.

## wrangler 환경

- **default**(이름 없음): 운영. `npx wrangler deploy --env=""`(환경이 둘이라 `--env=""`로 명시한다), `npx wrangler d1 migrations apply DB --remote --env=""`. GitHub OAuth callback 은 `https://comments.<subdomain>.workers.dev/v1/auth/callback`.
- **test**: 로컬 전용. `TEST_LOGIN=1`, `OWNER_GITHUB_ID=1`, 출처 `http://localhost:4321`·`http://127.0.0.1:4321`, `SITE_URL` 없음, D1 `comments-test`(로컬 상태는 `.wrangler/`). 다른 출처가 필요하면 `wrangler dev --env test --var ALLOWED_ORIGINS:<목록>`.

## 이후 단계를 위한 계약 (클라이언트·검사)

- 검사(CM-C)는 `npm --prefix comments run dev -- --port <p>`(또는 `db:migrate:test` 후 `npx wrangler dev --env test --port <p>`)로 띄우고 `GET /v1/health`가 200 이 될 때까지 기다린다.
- 로그인은 GitHub 대신 `POST /v1/auth/test-login {"id": 1001, "login": "tester"}` → `{ "token" }`. id 1 은 관리자다. `createdAt`(ISO)을 주면 7일 규칙도 시험할 수 있다.
- 토큰은 클라이언트가 localStorage 에 두고 `Authorization: Bearer`로 보낸다.
