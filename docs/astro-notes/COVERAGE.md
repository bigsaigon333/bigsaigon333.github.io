# Astro 7 기능 커버리지

[Astro 문서](https://docs.astro.build/en/getting-started/) 사이드바(2026-11-17에 읽음)의 기능 항목마다 이 저장소가 어디서 다루는지 적는다. "노트"는 이 디렉터리의 번호, 경로는 저장소 루트 기준이다(`lab/`은 `labs/playground/`). 다루지 않은 것은 한 줄 이유를 단다. 튜토리얼, 업그레이드·이전 안내, 배포처·CMS·백엔드·미디어 호스팅 목록, 레시피 대부분, 오류 참조처럼 기능이 아닌 항목은 뺐다.

## Guide

| 문서 절          | 기능                          | 다루는 곳                                                                                    |
| ---------------- | ----------------------------- | -------------------------------------------------------------------------------------------- |
| Welcome          | 아일랜드 아키텍처             | 30 · `lab/src/pages/s83/index.astro`                                                         |
| Start            | 프로젝트 구조, dev·build      | 01 · `astro.config.mjs`, `src/pages/`                                                        |
| Configuration    | 설정 개요                     | 01 · `astro.config.mjs`, `config/*.mjs`                                                      |
|                  | 에디터 설정                   | 다루지 않음: 편집기 확장은 저장소 밖의 일이다                                                |
|                  | TypeScript                    | 11 · `tsconfig.json`, `tools/astro-check/`                                                   |
|                  | 환경 변수                     | 15(`import.meta.env.DEV`), 24(`astro:env`) · `config/env.mjs`, `config/.env.*`               |
|                  | 통합 쓰기(`astro add`)        | 20 · `astro.config.mjs`의 `mdx()`                                                            |
|                  | Build with AI                 | 다루지 않음: Astro 기능이 아니라 도구 안내다                                                 |
|                  | 개발 툴바                     | 32 · `lab/src/s85/toolbar-app.ts`                                                            |
| Routing          | 페이지, 404                   | 01, 05, 08 · `src/pages/index.astro`, `src/pages/404.astro`                                  |
|                  | 동적 라우트, `getStaticPaths` | 03, 16 · `src/pages/posts/[id].astro`, `src/pages/tags/[tag].astro`                          |
|                  | 리다이렉트, 리라이트          | 31 · `lab/config/s84.mjs`, `lab/src/pages/s84/go.astro`                                      |
|                  | 페이지네이션 `paginate()`     | 31 · `lab/src/pages/s84/posts/[page].astro`                                                  |
|                  | 엔드포인트(정적)              | 08, 19 · `src/pages/sitemap.xml.ts`, `src/pages/rss.xml.ts`                                  |
|                  | 엔드포인트(요청 시)           | 27 · `lab/src/pages/s81/api/items.ts`                                                        |
|                  | 미들웨어                      | 31 · `lab/src/middleware.ts`, `lab/src/s84/middleware.ts`                                    |
|                  | i18n 라우팅                   | 31 · `lab/src/s84/i18n.ts`, `lab/src/pages/ko/s84/`                                          |
|                  | Prefetch                      | 23 · `astro.config.mjs`의 `prefetch`                                                         |
|                  | View transitions              | 23 · `src/layouts/BaseLayout.astro`(`<ClientRouter />`). `transition:*` 지시어는 쓰지 않았다 |
| Build your UI    | 컴포넌트, props, slot         | 05 · `src/components/`                                                                       |
|                  | 레이아웃                      | 05 · `src/layouts/BaseLayout.astro`                                                          |
|                  | 스타일과 CSS                  | 06, 09, 21 · `src/styles/`                                                                   |
|                  | Fonts                         | 13 · `config/fonts.mjs`, `src/components/HeadAssets.astro`                                   |
|                  | 구문 강조(Shiki)              | 12 · `config/markdown.mjs`, `src/styles/code.css`. `<Code />` 컴포넌트는 쓸 곳이 없었다      |
|                  | 스크립트와 이벤트             | 07, 22 · `src/components/CopyCode.astro`, `src/components/Toc.astro`                         |
|                  | 프런트엔드 프레임워크         | 30 · `lab/src/s83/Counter.tsx`(Preact)                                                       |
| Add content      | Markdown                      | 04, 12 · `config/markdown.mjs`, `posts/*.md`                                                 |
|                  | MDX                           | 20 · `posts/draft/mdx-demo.mdx`, `src/components/mdx/Callout.astro`                          |
|                  | 콘텐츠 컬렉션(빌드 시)        | 02, 15, 16, 17 · `src/content.config.ts`, `src/content/series.json`                          |
|                  | 라이브 컬렉션                 | 32 · `lab/src/live.config.ts`, `lab/src/s85/notes-loader.ts`                                 |
|                  | 이미지(`astro:assets`)        | 14 · `src/components/Header.astro`(`<Picture />`), `config/html-images.mjs`                  |
|                  | SVG 컴포넌트                  | 다루지 않음: 아이콘이 PNG(`public/github-sign.png`)로 남았고 배포본과 같게 두었다            |
|                  | 데이터 가져오기(`fetch`)      | 다루지 않음: 글이 모두 저장소 안의 파일이라 빌드 때 받아 올 원격 데이터가 없다               |
| Server rendering | 요청 시 렌더링, 어댑터        | 27 · `lab/astro.config.mjs`(`@astrojs/node`), `lab/src/pages/s81/dynamic.astro`              |
|                  | 서버 아일랜드                 | 30 · `lab/src/s83/Stamp.astro`(`server:defer`)                                               |
|                  | Actions                       | 29 · `lab/src/actions/index.ts`, `lab/src/pages/s82/subscribe.astro`                         |
|                  | 세션                          | 29 · `lab/config/s82.mjs`, `lab/src/s82/cart.ts`                                             |
|                  | 라우트 캐시                   | 32 · `lab/config/s85.mjs`(`cache`, `routeRules`), `lab/src/pages/s85/cache/`                 |
| Recipes(일부)    | RSS, 읽는 시간, 툴바 앱, 폼   | 19, 18, 32, 29 · `src/pages/rss.xml.ts`, `src/lib/reading-time.ts`                           |
| Deploy           | GitHub Pages                  | PLAN.md S3.2 · `.github/workflows/deploy.yml`(노트는 없다)                                   |
| Testing          | Vitest                        | 26 · `vitest.config.ts`, `src/**/*.test.ts`                                                  |

## Reference

| 문서 절           | 기능                                             | 다루는 곳                                                                                       |
| ----------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Template syntax   | 표현식, `set:html`, `class:list`                 | 05, 10 · `src/components/Seo.astro`, `src/components/mdx/Callout.astro`                         |
|                   | `is:inline`, `define:vars`, `is:global`          | 06, 07, 21, 28 · `src/components/Analytics.astro`                                               |
|                   | `client:*`, `server:defer`                       | 30 · `lab/src/pages/s83/index.astro`                                                            |
| Configuration     | `build.format`, `trailingSlash`, `site`          | 01, 08 · `astro.config.mjs`                                                                     |
|                   | `security.csp`                                   | 28 · `config/csp.mjs`                                                                           |
| CLI               | `astro dev/build/sync/check`                     | 01, 11, 20 · `package.json` scripts                                                             |
| Routing reference | `getStaticPaths`, `prerender`                    | 03, 27                                                                                          |
| Runtime API       | Render context(`Astro.url`, `cookies`, `locals`) | 03, 27, 31                                                                                      |
|                   | `astro:actions`, `astro/zod`                     | 29 · 02(`astro/zod` 스키마)                                                                     |
|                   | `astro:assets`                                   | 13, 14                                                                                          |
|                   | `astro:content`                                  | 02, 03, 17, 18                                                                                  |
|                   | `astro:env`                                      | 24 · `src/lib/site.ts`                                                                          |
|                   | `astro:i18n`, `astro:middleware`                 | 31                                                                                              |
|                   | `astro:transitions`                              | 23                                                                                              |
|                   | `astro:config`, `astro:static-paths`             | 다루지 않음: 설정 값과 경로를 모듈에서 읽을 일이 없었다                                         |
|                   | `astro/app`, `astro/fetch`, `astro/hono`         | 다루지 않음: 자체 서버나 `src/fetch.ts` 고급 라우팅은 데모 경계를 넘는다(32)                    |
| Markdown          | Sätteri                                          | 12 · `config/markdown.mjs`                                                                      |
| processors        | Unified                                          | 04(S4.1 전까지. 지금 트리에는 없다)                                                             |
| Dev APIs          | Integration API                                  | 25 · `integrations/site-guard.mjs`, 28 · `config/csp.mjs`                                       |
|                   | Content Loader API                               | 32 · `lab/src/s85/notes-loader.ts`(라이브 로더)                                                 |
|                   | Dev Toolbar App API                              | 32 · `lab/src/s85/toolbar-integration.mjs`                                                      |
|                   | Logger API                                       | 32 · `lab/src/s85/log-recorder.mjs`                                                             |
|                   | Cache Provider·Session Driver·Font Provider API  | 쓰기만 함: 내장 `memoryCache()`(32), `sessionDrivers.lruCache`(29), `fontProviders.local()`(13) |
|                   | Container API                                    | 26 · `src/components/Seo.test.ts`                                                               |
|                   | Adapter·Renderer·Image Service API               | 다루지 않음: 공식 어댑터·Preact·기본 이미지 서비스로 충분했다                                   |
|                   | Programmatic API                                 | 다루지 않음: 검증 장치는 CLI(`astro build --force`)를 부른다                                    |
| Experimental      | 실험 플래그 전부                                 | 다루지 않음: 운영 블로그에는 정식 기능만 쓴다. 7에서 정식이 된 것은 32가 다룬다                 |
| Legacy flags      | —                                                | 다루지 않음: 새로 시작한 Astro 7 프로젝트라 옛 동작이 필요 없다                                 |

## Ecosystem

| 문서 절       | 기능                      | 다루는 곳                                                                             |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------- |
| UI frameworks | Preact                    | 30 · `lab/src/s83/Counter.tsx`, `lab/src/s83/Later.tsx`                               |
|               | React·Solid·Svelte·Vue 등 | 다루지 않음: 아일랜드 비교에는 하나로 충분했고 Preact가 가장 작다                     |
| Adapters      | Node                      | 27 · `lab/astro.config.mjs`                                                           |
|               | Cloudflare·Netlify·Vercel | 다루지 않음: 블로그는 GitHub Pages 정적 배포다                                        |
| Integrations  | MDX                       | 20                                                                                    |
|               | Sitemap                   | 다루지 않음: 배포본의 `sitemap.xml`과 바이트가 같도록 엔드포인트로 직접 쓴다(08)      |
|               | Markdoc, Partytown        | 다루지 않음: 글은 Markdown이고, 서드파티 스크립트는 GA 하나라 워커로 옮길 이득이 작다 |
