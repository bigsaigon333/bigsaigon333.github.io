# 36. 댓글 워커: Cloudflare Workers + D1, 팝업 OAuth, bearer 토큰

> 이 워커는 main 에서 빼 브랜치 `comments-worker` 에 보존했다(별도 PR 로 다시 올릴 예정).

## 한 줄 요약

utterances 를 대신할 댓글 API 를 `comments/`(npm 패키지)에 만들었다. 워커 하나가 `/v1` 경로로 thread 목록·생성·답글·resolve·수정·soft delete·관리자 차단을 맡고, D1 테이블 7개에 저장한다. 로그인은 GitHub OAuth 를 팝업으로 열고(state + PKCE S256), 워커가 발급한 bearer 토큰을 클라이언트가 localStorage 에 둔다. `npm --prefix comments test`의 61개 시험이 workerd 안에서 로컬 D1 로 모든 엔드포인트를 돈다. 요청·응답 타입은 `comments/src/contract.ts`가 정답이다.

## 개념

- **왜 쿠키가 아닌가**: 워커는 `*.workers.dev`, 블로그는 `github.io`라 워커 쿠키는 서드파티 쿠키다. Safari·Chrome 이 막는다. 그래서 `Authorization: Bearer`를 쓴다. 쿠키가 없으니 CSRF 도 없다. 그래도 목록 밖 `Origin`의 쓰기는 처리 전에 403 으로 끊는다.
- **CORS 허용 목록**: `ALLOWED_ORIGINS`와 문자열이 정확히 같을 때만 `Access-Control-Allow-Origin: <그 출처>`와 `Vary: Origin`을 준다. 접두사가 같은 출처(`http://localhost:4321.evil.example`)는 시험으로 막았다.
- **팝업 OAuth**: `/v1/auth/start`가 state 와 PKCE verifier 를 D1 에 10분 두고 GitHub 로 302 한다. callback 은 `DELETE … RETURNING`으로 state 를 꺼내므로 한 번만 쓸 수 있다. 끝 페이지는 `script-src 'nonce-…'` CSP 아래에서 `window.opener.postMessage(msg, origin)`을 부른다. 대상은 `"*"`가 아니라 start 때 받은 출처다. opener 가 없으면 `return_to#comments-token=…`으로 이동한다(리다이렉트 대체 경로).
- **세션**: 토큰 원문은 응답에만 있고 D1 에는 sha256 만 남는다. 30일 뒤 `session_expired`.
- **남용 방지**: 쓰기는 사용자당 10분 10회(`write_events` 테이블로 센다, 429 + `Retry-After`), GitHub 가입 7일 미만 거부, 관리자(`OWNER_GITHUB_ID`) 차단과 일괄 soft delete, `MODE=readonly` 스위치.

## Next.js 대응

| Next.js                             | 이 워커                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| Route Handler `app/api/*/route.ts`  | `src/index.ts`의 정규식 라우트 표와 `handle(request, env)`       |
| `middleware.ts`에서 CORS·인증       | `handle`이 OPTIONS·출처 검사 → 라우트 → `withCors`               |
| NextAuth GitHub provider(쿠키 세션) | 직접 만든 OAuth + bearer 토큰(쿠키 없음)                         |
| Prisma 마이그레이션                 | `migrations/NNNN_*.sql` + `wrangler d1 migrations apply`         |
| `process.env.X`                     | `env.X`(wrangler `vars`, secret, 바인딩). 요청마다 인자로 받는다 |

## 빌드 결과물에서 확인하기

- `npx wrangler deploy --dry-run --outdir <dir>`: 번들 31KiB(gzip 8KiB). 바인딩 표에 `DB`, `ALLOWED_ORIGINS`, `MODE`, `SITE_URL`만 있고 secret 과 `TEST_LOGIN`은 없다.
- `npm --prefix comments run dev`(로컬 D1 마이그레이션 → `wrangler dev --env test`) 뒤 `curl -i localhost:8787/v1/health -H 'Origin: http://localhost:4321'`이 `{"ok":true,"mode":"readwrite"}`와 `Access-Control-Allow-Origin`을 준다.
- 같은 서버에 `POST /v1/auth/test-login {"id":42,"login":"t"}` → `{token}`. 그 토큰으로 thread 를 만들고 목록에서 다시 읽힌다.

## 닫힌 고리가 잡아낸 것

- 처음 받은 `@cloudflare/vitest-pool-workers`는 README 첫 줄이 "Deprecated, `@cloudflare/vitest-plugin`으로 이름이 바뀌었다"였다. 게다가 vitest 4 까지만 받는다. 이름이 바뀐 패키지(1.8, vitest 5 지원)로 옮겨 루트와 같은 vitest 5 를 쓴다.
- 팝업 페이지의 JSON 이스케이프에 U+2028 을 정규식 리터럴로 직접 넣었더니 oxc 가 "Unterminated regular expression"으로 변환을 멈췄다. ES2019 부터 문자열 안의 U+2028 은 합법이라 그 치환을 지웠다(`<`, `>`, `&`만 이스케이프).
- 시험이 한 번에 통과해서 변이를 넣어 봤다. 요청 수 한도를 2배로, PKCE verifier 를 상수로, state 만료 검사를 끄면 각각 정확히 그 시험 1개씩(총 3개)이 실패한다.
- 루트 `tsc`와 `astro check`는 `**/*`를 보므로 `comments/`의 workers 타입(`D1Database`, `cloudflare:workers`)을 모른다(14개 오류). 루트 설정에서 `comments`를 빼는 일은 CM-D 단계가 맡는다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `comments/src/http.ts`의 `isAllowedOrigin`을 `origin !== null && [...allowedOrigins(env)].some((o) => origin.startsWith(o))`로 바꾸고 `npm --prefix comments test`.
   <details><summary>예상 결과</summary>`prefix-matching origins are not allowed` 하나가 실패한다. `http://localhost:4321.evil.example`이 `Access-Control-Allow-Origin`을 받는다. 출처는 접두사가 아니라 문자열 전체로 비교해야 한다.</details>
2. `comments/src/oauth.ts`의 `popupFinish`에서 `postMessage(m,o)`를 `postMessage(m,"*")`로 바꾸고 같은 명령.
   <details><summary>예상 결과</summary>팝업 시험이 `postMessage(m,o)`와 `"*"` 금지 단언에서 실패한다. `"*"`면 opener 창이 다른 사이트로 이동해 있어도 토큰이 그쪽으로 간다.</details>

## 문서 근거

- https://developers.cloudflare.com/workers/testing/vitest-integration/ (`cloudflareTest`, `readD1Migrations`, `applyD1Migrations`, `cloudflare:workers`의 `exports`)
- https://developers.cloudflare.com/d1/reference/migrations/ (`wrangler d1 migrations apply --local/--remote`)
- https://developers.cloudflare.com/workers/wrangler/configuration/#environments (`env.test`, `--env=""`)
- https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps (state, PKCE `code_challenge_method=S256`)
- https://datatracker.ietf.org/doc/html/rfc7636#section-4.2 (S256 = BASE64URL(SHA256(verifier)))
