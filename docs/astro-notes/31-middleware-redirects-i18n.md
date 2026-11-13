# 31. 미들웨어, 리다이렉트·리라이트, i18n 라우팅, `paginate()`

## 한 줄 요약

`labs/playground/`에 S8.4 데모를 더했다. `src/middleware.ts`의 `sequence(timing, whoami, koFallback)`이 `/s84`·`/ko/s84` 요청에만 `locals`와 `X-S84-Request-Id`·`Server-Timing` 헤더를 붙이고, 설정 리다이렉트(301·302·동적 파라미터), `Astro.redirect`(307·303), 리라이트(`Astro.rewrite`, 미들웨어 `next(url)`), en/ko 두 로케일과 ko→en 대체, `paginate()` 목록을 보인다. i18n은 전역 설정이라 `routing: "manual"`에 `fallback` 없이 두고 대체는 미들웨어가 `/ko/s84/**`에서만 한다. `npm --prefix labs/playground run verify` → `ALL PASS 16/16`.

## 개념

- **미들웨어**: `src/middleware.ts`가 `onRequest`를 이름으로 export한다. `defineMiddleware((context, next) => …)`로 타입을 얻고, `sequence(a, b, c)`는 a→b→c로 들어가 c→b→a로 나온다. `await next()`의 `Response`를 고쳐 헤더를 단다(리다이렉트 응답은 헤더가 불변이라 `new Response(body, res)`로 복사).
- **locals**: `context.locals`는 한 요청 동안 미들웨어·페이지가 함께 쓰는 객체. 속성만 바꾼다. 타입은 `declare namespace App { interface Locals {…} }`(`src/s84/locals.d.ts`).
- **설정 리다이렉트**: `redirects: { "/s84/old": "/s84/new" }`는 301, `{ status: 302, destination }`는 그 상태. `"/s84/legacy/[page]": "/s84/posts/[page]"`처럼 같은 파라미터를 옮길 수 있다. Node 어댑터에서는 정적 파일이 아니라 서버가 진짜 3xx를 준다.
- **동적 리다이렉트**: 페이지 프런트매터에서 `return Astro.redirect(url, 307)`. 상태를 요청마다 고른다. 대상이 없으면 `Astro.response.status = 400`.
- **리라이트**: `Astro.rewrite("/s84/new")`·`context.rewrite()`는 다른 라우트를 렌더링하되 브라우저 URL은 그대로(3xx·`Location` 없음), 미들웨어를 다시 돈다. `next("/s84/locals")`는 미들웨어를 다시 돌지 않는다. 렌더된 페이지의 `Astro.url`은 대상 URL이고 `Astro.originPathname`이 원래 경로다.
- **i18n**: `i18n: { locales: ["en","ko"], defaultLocale: "en", routing: "manual" }`. 기본 로케일은 접두사 없음(`/s84/i18n/hello`), ko는 `/ko/s84/i18n/hello`(`src/pages/ko/s84/**`). `Astro.currentLocale`은 경로 조각에서 로케일을 찾고, `getRelativeLocaleUrl("ko", "s84/i18n/hello")`가 링크를 만든다.
- **전역 영향을 막은 방법**: Astro의 `i18n.fallback`을 주면 기본 로케일의 모든 페이지(`/s81/…`, `/s82/…`)에 `/ko/…` 대체 라우트가 생긴다. `"manual"`은 Astro의 i18n 미들웨어를 끄므로 다른 데모 URL은 검사·리다이렉트되지 않는다. 그래서 대체는 `koFallback`이 `/ko/s84/`에서 404일 때만 `context.rewrite(en 경로)`로 한다. `/ko/s81/dynamic/`은 그대로 404.
- **paginate**: `[page].astro`의 `getStaticPaths`에서 `paginate(posts, { pageSize: 3 })`. `Astro.props.page`의 `data`·`start`·`end`·`total`·`currentPage`·`url.prev`·`url.next`. 정적이라 `/s84/posts/1~3`이 파일로 나온다.

## Next.js 대응

| Next.js                                        | Astro (S8.4)                                         |
| ---------------------------------------------- | ---------------------------------------------------- |
| `middleware.ts` + `NextResponse.next()`        | `src/middleware.ts` `onRequest` + `next()`           |
| 요청 헤더로 값 전달                            | `context.locals` (`App.Locals` 타입)                 |
| `next.config.js` `redirects()` (`permanent`)   | `redirects` 설정 (기본 301, 객체로 `status`)         |
| `redirect()` / `NextResponse.redirect(url, s)` | `Astro.redirect(url, status)`                        |
| `NextResponse.rewrite(url)`                    | `Astro.rewrite(url)`, `context.rewrite`, `next(url)` |
| `i18n` (pages router) / `[lang]` 세그먼트      | `i18n` 설정 + `astro:i18n` 헬퍼                      |
| 직접 페이지 나누기                             | `paginate()` in `getStaticPaths`                     |

## 빌드 결과물에서 확인하기

- `dist/client/s84/posts/{1,2,3}/index.html`만 있다. 리다이렉트용 HTML도, `dist/client/ko/`도 없다.
- `curl -i /s84/old` → `301 location: /s84/new`, `/s84/moved` → 302, `/s84/legacy/2` → `301 /s84/posts/2`.
- `/s84/locals`의 `data-request-id`가 응답 헤더 `x-s84-request-id`와 같고 `server-timing: s84;dur=…`. `/s81/dynamic/`에는 두 헤더가 없다.
- `/ko/s84/i18n/about` → 200, en 내용, `x-s84-fallback: ko->en`, `data-requested-locale="ko"`.

## 닫힌 고리가 잡아낸 것

- 구현 전 `--only=s84`로 `FAILED 2/9`(404, 파일 없음)를 먼저 봤다.
- `Astro.url`은 리라이트 대상(`/s84/new`)으로 바뀐다. "URL 유지"는 `Astro.originPathname`(끝 `/`가 붙는다)과 3xx 없음으로 확인한다.
- `context.rewrite()`는 미들웨어를 다시 돌려 `timing`이 `locals.s84`를 새로 덮었다(요청한 로케일이 사라짐). `??=`로 처음 값을 지킨다.
- 미들웨어에서 `next("/s84/posts/1")`(정적 페이지)로 리라이트하면 500 `Unexpectedly unable to find a component instance`. 요청 시 렌더링 페이지로만 리라이트한다.
- `getRelativeLocaleUrl`은 끝에 `/`를 붙인다(`trailingSlash: "ignore"` + `format: "directory"`). 빈 `data-prev=""`는 값 없는 속성으로 렌더돼 `"none"`을 쓴다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `config/s84.mjs`의 i18n에 `fallback: { ko: "en" }`을 더하고 `routing`을 `{ fallbackType: "rewrite" }`로 바꿔 `npm --prefix labs/playground run verify`.
   <details><summary>예상 결과</summary>`FAILED 14/16`. `dist/client/ko/s81/static/index.html`, `dist/client/ko/s84/posts/1~3`이 생겨 "i18n is scoped"가 실패한다(대체 라우트는 데모 경계를 모른다). 대체 케이스는 `'ko' !== 'en'`: Astro의 대체 라우트에서는 `Astro.currentLocale`이 요청한 `ko`다.</details>
2. `src/s84/middleware.ts`의 `whoami`에서 대상을 `/s84/posts/1`로 바꾸고 `curl -i /s84/whoami`.
   <details><summary>예상 결과</summary>500. 서버 로그에 `Unexpectedly unable to find a component instance for route /s84/posts/[page]` — 정적 페이지는 서버 번들에 없다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/middleware/ (`onRequest`, `sequence`, `locals`, `next(url)`, `context.rewrite`)
- https://docs.astro.build/en/guides/routing/ (`redirects`, `Astro.redirect`, `Astro.rewrite`, `paginate()`)
- https://docs.astro.build/en/guides/internationalization/ (`routing: "manual"`, `fallback`, `getRelativeLocaleUrl`)
- https://docs.astro.build/en/reference/api-reference/#originpathname (`Astro.originPathname`)
