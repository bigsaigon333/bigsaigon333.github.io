# 27. 요청 시 렌더링: Node 어댑터, `prerender`, API 엔드포인트, 쿠키

## 한 줄 요약

블로그와 따로 도는 실험용 Astro 프로젝트 `labs/playground/`를 만들었다. `output: "static"`에 `@astrojs/node`(`mode: "standalone"`)를 붙이고, 페이지·엔드포인트마다 `export const prerender = false`로 요청 시 렌더링을 고른다. `npm --prefix labs/playground run verify`가 빌드 → 빈 포트에 서버 → `verify/*.mjs`의 케이스를 돌려 정적 파일과 요청마다 다른 페이지, JSON API(201·400·404·415), HttpOnly 쿠키 왕복을 확인한다. `labs/`는 main에 가지 않는다(릴리스 스크립트가 지우고 언급까지 막는다).

## 개념

- **기본은 정적**: `output: "static"`이면 모든 라우트를 빌드 때 만든다. `prerender = false`인 것만 서버가 요청마다 렌더링한다. `output: "server"`는 기본값만 뒤집는다(그때는 `prerender = true`로 정적을 고른다). 어댑터가 없으면 요청 시 렌더링을 쓸 수 없다.
- **standalone**: 빌드가 `dist/client/`(정적 파일)와 `dist/server/entry.mjs`(서버)를 낸다. `node dist/server/entry.mjs`가 바로 서버를 띄우고, `HOST`·`PORT` 환경 변수를 읽는다. 정적 파일이 있으면 그것을 먼저 주고(ETag, `Last-Modified`), 없으면 앱이 렌더링한다.
- **엔드포인트**: `src/pages/**.ts`에서 `GET`·`POST`·`DELETE`를 export하고 `Response`를 돌려준다. `satisfies APIRoute`로 컨텍스트(`url`, `request`, `cookies`) 타입을 얻는다. `HEAD`는 `GET`에서 몸통만 뺀 것이 자동으로 온다. export하지 않은 메서드(`PUT`)는 404 페이지다.
- **검증 순서**: Content-Type이 JSON이 아니면 415 → `request.json()`이 던지면 400 → 값 검사 실패 400 → 성공 201 + `Location`. 저장소는 프로세스 메모리(`Map`)라 서버가 살아 있는 동안만 남는다.
- **쿠키**: `cookies.get(name)?.number()`로 읽고 `cookies.set(name, value, { path, httpOnly, sameSite, maxAge })`로 `Set-Cookie`를 단다. `cookies.delete`는 값 `deleted`와 1970년 만료로 지운다. `path: "/s81"`이라 그 아래 URL에만 실려 온다.
- **lab 계약**: `astro.config.mjs`가 `config/s82~s85.mjs`를 작은 deep-merge(객체는 키별, 배열은 이어 붙임)로 합친다. 데모마다 `src/pages/<demo>/`, `src/<demo>/`, `verify/<demo>.mjs`만 고친다. `src/middleware.ts`는 빈 `sequence()`.

## Next.js 대응

| Next.js                                   | Astro (S8.1)                                                |
| ----------------------------------------- | ----------------------------------------------------------- |
| `export const dynamic = "force-dynamic"`  | `export const prerender = false`                            |
| `output: "standalone"` + `node server.js` | `@astrojs/node` `standalone` + `node dist/server/entry.mjs` |
| `app/api/x/route.ts`의 `GET`·`POST`       | `src/pages/x.ts`의 `GET`·`POST` (`APIRoute`)                |
| `cookies()` (`next/headers`)              | `context.cookies` / `Astro.cookies`                         |
| `NextResponse.json(body, { status })`     | `new Response(JSON.stringify(body), { status, headers })`   |

## 빌드 결과물에서 확인하기

- `dist/client/s81/static/index.html`만 있다. 서빙된 바이트가 이 파일과 같고, 두 요청이 같다(빌드 시각이 박혀 있다).
- `dist/client/s81/dynamic/`은 없다. `/s81/dynamic/?name=…`은 요청마다 `data-request-id`가 다르고 `Cache-Control: no-store`.
- `GET /s81/api/visits` → `Set-Cookie: s81-visits=1; Max-Age=3600; Path=/s81; HttpOnly; SameSite=Strict`. 쿠키를 돌려보내면 2. 브라우저(Playwright)에서는 `document.cookie`에 보이지 않는다.
- `npm --prefix labs/playground run verify` → `ALL PASS 7/7`. `run check` 0 errors.

## 닫힌 고리가 잡아낸 것

- 페이지·엔드포인트를 만들기 전에 돌려 `FAILED 0/6`(404, 파일 없음)을 먼저 봤다.
- 브라우저 케이스: `context.cookies(base)`는 빈 배열이었다. `Path=/s81` 쿠키는 URL 경로로 걸러져 `/`에는 안 붙는다. `${base}/s81/`로 물어야 한다.
- 실험 1을 돌리면 `dist/client/s81/api/visits`가 확장자 없는 파일로 생기고, 브라우저는 그것을 페이지가 아닌 다운로드로 받는다.
- 릴리스: `EXCLUDED_PATHS`에 `labs`, 루트 `.oxlintrc.json`의 `/labs`와 `tsconfig.json` `exclude`의 `labs`를 지우는 처리, MENTIONS에 `labs`를 더했다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `src/pages/s81/dynamic.astro`와 `src/pages/s81/api/visits.ts`의 `prerender = false`를 `true`로 바꾸고 `npm --prefix labs/playground run verify`.
   <details><summary>예상 결과</summary>`FAILED 4/7`. `dist/client/s81/dynamic exists: it was prerendered`, 쿠키 케이스는 `content-type is not JSON`(빌드 때 한 번 만든 파일이라 `Set-Cookie`도 없다), 브라우저 케이스는 `Download is starting`.</details>
2. `curl -i -X PUT`과 `curl -I`로 서버의 `/s81/api/items`를 두드린다.
   <details><summary>예상 결과</summary>`PUT`은 404 HTML 페이지(내보낸 `PUT`이 없다). `HEAD`는 200 `application/json`에 몸통이 없다(`GET`에서 만든다).</details>

## 문서 근거

- https://docs.astro.build/en/guides/on-demand-rendering/ (`prerender`, `output`, 쿠키 예)
- https://docs.astro.build/en/guides/integrations-guide/node/ (`mode: "standalone"`, `HOST`·`PORT`)
- https://docs.astro.build/en/guides/endpoints/ (`APIRoute`, 메서드 export, `HEAD`)
- https://docs.astro.build/en/reference/api-reference/#cookies (`cookies.set` 옵션, `delete`)
