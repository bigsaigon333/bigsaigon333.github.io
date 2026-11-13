# 30. 서버 아일랜드와 클라이언트 아일랜드: `server:defer`, `client:*`, Preact

## 한 줄 요약

`labs/playground/`에 `@astrojs/preact`를 붙이고 `/s83/`을 만들었다. 셸은 빌드 때 만든 정적 HTML이고, 그 안의 `<Stamp server:defer>`는 요청마다 `/_server-islands/Stamp`에서 따로 렌더링된다(먼저 `slot="fallback"`이 보이고 응답이 오면 바뀐다). 같은 Preact 카운터를 `client:load`·`client:idle`·`client:media`·`client:visible`·지시어 없음으로 놓아 하이드레이션 시점이 다른 것을, 지시어 없는 컴포넌트만 있는 `/s83/static/`이 JS를 하나도 싣지 않는 것을 `verify/s83.mjs`(HTTP 2개, Playwright 3개, 빌드 파일 1개)가 확인한다.

## 개념

- **서버 아일랜드**: `.astro` 컴포넌트에 `server:defer`를 달면 페이지 렌더링에서 빠지고 자기 라우트(`/_server-islands/<이름>`)가 생긴다. 어댑터가 필요하다. 셸이 정적이어도 섬은 요청 시 렌더링이다. 느린 섬이 페이지나 다른 섬을 막지 않는다.
- **fallback**: `slot="fallback"` 자식이 셸에 그대로 들어가고, 인라인 스크립트가 섬 HTML을 받아 fallback을 지우고 끼운다. 응답이 200·`text/html`이 아니면 fallback이 남는다.
- **props**: 직렬화 가능한 값만 된다(함수 불가). 컴포넌트 이름(`e`)·props(`p`)·슬롯(`s`)을 빌드 키로 암호화해 GET 쿼리에 싣고 `<link rel="preload" as="fetch">`로 미리 받는다. URL이 2048자를 넘으면 POST로 바뀌어 브라우저 캐시를 못 쓴다. 롤링 배포에서는 `astro create-key`로 만든 `ASTRO_KEY`를 고정한다.
- **섬 안의 `Astro.url`**: 섬 라우트(`/_server-islands/Stamp`)다. 페이지 URL은 `Referer` 헤더로 읽는다.
- **클라이언트 아일랜드**: UI 프레임워크 컴포넌트는 기본이 HTML만이다. `client:load`(바로), `client:idle`(`requestIdleCallback`), `client:visible`(IntersectionObserver), `client:media="(…)"`(쿼리가 맞을 때), `client:only="preact"`(서버 렌더링 없이)를 달아야 `<astro-island>`로 감싸고 JS를 싣는다.
- **Preact 연결**: `config/s83.mjs`의 `integrations: [preact()]`. JSX 프레임워크가 하나라 `include`가 필요 없다. 공용 `tsconfig.json`을 건드리지 않으려고 `.tsx`마다 `/** @jsxImportSource preact */`를 달았다.

## Next.js 대응

| Next.js                                        | Astro (S8.3)                                       |
| ---------------------------------------------- | -------------------------------------------------- |
| PPR: 정적 셸 + `<Suspense>` 안의 동적 부분     | 정적 페이지 + `server:defer` 섬                    |
| `<Suspense fallback={…}>`                      | `<X server:defer><Y slot="fallback" /></X>`        |
| `"use client"` 컴포넌트(항상 하이드레이션)     | `client:load` 등 지시어를 단 사용처만 하이드레이션 |
| `next/dynamic` + `ssr: false`                  | `client:only="preact"`                             |
| 서버 컴포넌트(JS 0)                            | 지시어 없는 프레임워크 컴포넌트, `.astro` 컴포넌트 |
| 뷰포트 진입 시 로드: 직접 IntersectionObserver | `client:visible` (`{ rootMargin }` 옵션)           |

## 빌드 결과물에서 확인하기

- `dist/client/s83/index.html`에 fallback(`data-s83-fallback`)과 `/_server-islands/Stamp?e=…&p=…&s=` preload가 있고 섬 내용은 없다. `dist/client/_server-islands/`는 없다.
- 섬 URL을 두 번 GET하면 `data-s83-island-id`가 다르다. 응답은 `text/html` 조각에 `X-Robots-Tag: noindex`, `Cache-Control`은 붙지 않는다. `e`를 바꾸면 400.
- `<astro-island>`는 `client="load"|"idle"|"media"|"visible"` 4개뿐이고 지시어 없는 카운터는 감싸지지 않는다. `_astro/`에 `Later.*.js`가 따로 생긴다.
- `dist/client/s83/static/index.html`에는 `<script>`가 없고, 브라우저도 스크립트를 요청하지 않는다.
- `npm --prefix labs/playground run verify` → `ALL PASS 13/13`(s81 7 + s83 6), `run check` 0 errors.

## 닫힌 고리가 잡아낸 것

- 페이지를 만들기 전 `--only=s83`이 `FAILED 0/6`(파일 없음, fallback 없음, 시간 초과)인 것을 먼저 봤다.
- 변이 확인: `client:visible`을 `client:load`로 바꾸면 `visible hydrated early`, 정적 페이지에 `client:idle`을 하나 달면 `the page has a <script>`로 각각 실패했다(되돌림).
- `curl`로 섬 라우트를 두드려 보니 캐시 헤더가 없었다. 첫 케이스 이름에 넣었던 "no-cache headers"를 빼고 실제로 오는 `noindex`와 위조 `e`의 400을 검사했다.
- fallback이 너무 빨리 사라져 관찰이 흔들리지 않게, Playwright `page.route`로 섬 요청을 붙잡았다 풀어 순서를 결정적으로 만들었다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `src/pages/s83/index.astro`에서 `<Stamp server:defer …>`의 `server:defer`를 지우고 `npm --prefix labs/playground run verify -- --only=s83`.
   <details><summary>예상 결과</summary>섬이 빌드 때 한 번 렌더링되어 셸에 박히고, `<slot />`이 없는 `Stamp`라 fallback 자식은 버려진다. 첫 케이스가 `the fallback is not in the shell`로, preload 링크가 없어 두 번째 케이스도 실패한다.</details>
2. `<Stamp>`에 `label={"x".repeat(3000)}`를 넘기고 빌드한 뒤 `dist/client/s83/index.html`을 연다.
   <details><summary>예상 결과</summary>URL이 2048자를 넘어 preload 링크가 사라지고 인라인 스크립트가 `method: 'POST'`로 props를 몸통에 싣는다. 첫 케이스는 `no preload link`로 실패한다.</details>
3. `<Later name="visible" client:visible={{ rootMargin: "4000px" }} />`로 바꾼다.
   <details><summary>예상 결과</summary>여유가 3000px 스페이서보다 커서 스크롤 전에 하이드레이션된다. 네 번째 케이스가 `visible hydrated early`로 실패한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/server-islands/ (`server:defer`, fallback, props 암호화, 2048자 POST, `Referer`, `ASTRO_KEY`)
- https://docs.astro.build/en/concepts/islands/ (클라이언트·서버 아일랜드, 기본 JS 0)
- https://docs.astro.build/en/reference/directives-reference/#client-directives (`client:*` 시점과 옵션)
- https://docs.astro.build/en/guides/integrations-guide/preact/ (`preact()`, `jsxImportSource`, `include`)
