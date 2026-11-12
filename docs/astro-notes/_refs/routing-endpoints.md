# 문서 요약: routing-endpoints

> 문서 스카우트가 공식 문서를 읽고 요약한 것이다. 요약과 실제 동작이 다르면 실제 동작을 따르고 학습 노트에 적는다.

## routing-endpoints (Astro 현재 문서 기준, 2026-11-12 조회)

**1. 파일 라우팅**
- `src/pages/` 경로가 URL: `index.astro`→`/`, `about/index.astro`→`/about`, `posts/1.md`→`/posts/1`.
- 동적: `[id].astro`, `[...slug].astro`(rest, 값 `undefined`면 상위 경로 매치). 예: `[lang]/[version]/info.astro`.
- 우선순위(위가 우선): 예약 라우트 → 세그먼트 많은 경로 → 정적 → 이름 있는 동적 → rest → prerender 동적 → 서버 동적 → endpoint → page → redirect → 알파벳순.
- 예약 경로: `_astro/`, `_server_islands/`, `_actions/`. `_` 접두 파일은 라우터가 무시(요약 기반 확인).

**2. getStaticPaths()** (static 모드 필수)
```ts
export function getStaticPaths() {
  return [{ params: { id: '1' }, props: { title: 'x' } }];
}
```
- 반환: `{ params, props? }` 객체 배열. `params` 키는 파일명 파라미터와 일치, 값은 문자열만 지원. `props`는 문자열 제약 없음.
- 타입: `import type { GetStaticPaths, InferGetStaticParamsType, InferGetStaticPropsType } from "astro";` / `satisfies GetStaticPaths` / `InferGetStaticParamsType<typeof getStaticPaths>`, `InferGetStaticPropsType<typeof getStaticPaths>`.
- 제약: "executes in its own isolated scope once"; 부모 스코프 참조 불가(파일 import 제외). Astro 글로벌 금지 여부는 문서에 없음.
- 인코딩된 params는 `decodeURI()` 필요.

**3. Static file endpoint**
- `src/pages/sitemap.xml.ts` → `/sitemap.xml` (`.ts` 제거, 확장자 포함 이름). 빌드 시 파일로 생성.
```ts
import type { APIRoute } from "astro";
export const GET = (async ({ params, request }) => {
  return new Response(body);
}) satisfies APIRoute;
```
- 문서상 `Response` 본문이 파일 내용. `encoding` 속성은 v3 이후 불필요. Content-Type 지정 예시는 SSR 섹션(`headers: { "Content-Type": "image/png" }`)에만 있음.
- 확장자 있는 endpoint는 `build.trailingSlash`와 무관하게 `/sitemap.xml`(슬래시 없이)만 접근. v6 표기는 문서에 없음.

**4. Custom 404**
- `src/pages/404.astro` 또는 `404.md` → `404.html` 생성. `build.format: 'file'`의 출력 경로는 이것. `'directory'` 출력 경로는 문서에 없음.
- `500.astro`는 on-demand 전용, prerender 페이지에는 미적용.

**5. Astro 글로벌 (prerender 빌드 시)**
- `Astro.params`: getStaticPaths의 `params` 값. `Astro.props`: `props` 객체.
- `Astro.site`: config `site`의 `URL`, 미설정 시 `undefined`.
- `Astro.url`: `site`+`base` 기준 URL, `site` 미설정이면 localhost.
- `Astro.request.url`: prerender에서 쿼리스트링 없음. `clientAddress`, `session`은 prerender 불가.

**6. v7 라우팅 변경**
- `advancedRouting` 기본 on (experimental 플래그 제거). 예약 파일명 `src/fetch.ts`(또는 `.js`). 회피: `fetchFile: './src/router.ts'` 또는 `fetchFile: null`.
- v6: `Astro.url.pathname`이 부분 디코딩될 수 있음.
- v7 블로그 영향: `.md` 기본 처리기가 Sätteri로 변경. remark/rehype 유지 시 `@astrojs/markdown-remark` 설치 후 `markdown: { processor: unified() }`.
- v7: `compressHTML` 기본 `'jsx'`, Rust 컴파일러는 닫히지 않은 태그를 에러로 처리.
- 실험 플래그: `redirect-page`(experimental).

**7. Redirects (static)**
- `astro.config.mjs`의 `redirects: { "/old": "/new" }`. static 출력은 meta refresh HTML 생성(status 무시), 기본 301. 동적 경로는 파라미터 동일 필요.

**문서에 없음**: 404 directory 출력 경로, Astro 글로벌 금지의 v6 명시, params 문자열의 v6 명시.

## 읽은 문서

- https://docs.astro.build/en/guides/routing/
- https://docs.astro.build/en/reference/routing-reference/
- https://docs.astro.build/en/guides/endpoints/
- https://docs.astro.build/en/basics/astro-pages/
- https://docs.astro.build/en/guides/upgrade-to/v7/
- https://docs.astro.build/en/reference/api-reference/
- https://docs.astro.build/en/guides/typescript/

## 확인하지 못한 것

- build.format 'directory' 모드의 404 출력 경로 (문서에 없음)
- getStaticPaths 내 Astro 글로벌 사용 금지가 v6 변경이라는 명시 (문서에 없음)
- params 문자열 요구사항이 v6 변경이라는 명시 (문서에 'only strings are supported'만 있음)
- static 모드 endpoint에서 Content-Type 헤더 지정 예시 (문서에 없음)
- '_' 접두 파일 제외 규칙은 routing 가이드 후반부 요약에서만 확인
- routing 가이드 후반(pagination, excluding pages) 및 advanced routing 세부는 요약 기반
