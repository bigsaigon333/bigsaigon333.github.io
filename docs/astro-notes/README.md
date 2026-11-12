# Astro 학습 노트

Next.js 13 블로그를 Astro 7로 옮기면서 단계마다 하나씩 쓴 노트다. 모든 노트는 같은 일곱 절(한 줄 요약 → 개념 → Next.js 대응 → 빌드 결과물에서 확인하기 → 닫힌 고리가 잡아낸 것 → 직접 해볼 실험 → 문서 근거)로 되어 있고, `node scripts/notes-lint.mjs`가 그 모양을 검사한다.

## 읽는 순서

번호는 쓴 순서다. 아래 순서로 읽으면 앞 노트가 뒤 노트의 바탕이 된다.

| 순서 | 노트                                                                        | Astro 개념                                                   | 단계 | `dist/`에서 볼 곳                                                    |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------ | ---- | -------------------------------------------------------------------- |
| 1    | [01. 프로젝트 구조, CLI, 설정](01-project-structure.md)                     | 예약 폴더 `src/pages/`, `astro.config.mjs`, `build.format`   | S1.1 | `find dist -name '*.html'`: `posts/<id>.html` 모양, `_astro/`가 없다 |
| 2    | [05. 컴포넌트, props, 레이아웃, slot, head 태그](05-components-layouts.md)  | `.astro` 컴포넌트, `Astro.props`, `<slot />`                 | S1.2 | `dist/index.html`의 `<head>` 순서와 `<div class="layout">`           |
| 3    | [06. 스타일: 전역 CSS, scoped style, :global()](06-styles.md)               | scoped `<style>`, `:global()`, CSS 묶음과 인라인             | S1.4 | `data-astro-cid-…` 속성, `</head>` 바로 앞의 인라인 `<style>`        |
| 4    | [02. 콘텐츠 컬렉션: 로더, 스키마, getCollection](02-content-collections.md) | `glob()` 로더, Zod 스키마, `getCollection`                   | S1.3 | 홈 `<section>`의 `<article>` 12개와 `<time datetime>`                |
| 5    | [03. 동적 라우트: getStaticPaths와 render()](03-dynamic-routes.md)          | `[id].astro`, `getStaticPaths()`, `render()`                 | S2.1 | `dist/posts/`의 파일 12개, `<main class="prose">`                    |
| 6    | [04. 마크다운 파이프라인](04-markdown-pipeline.md)                          | `markdown.processor`(unified), remark·rehype 플러그인        | S2.2 | 글 페이지의 `<code class="hljs …">`, `class="katex"`                 |
| 7    | [09. 글 본문 스타일](09-post-styles.md)                                     | import 한 CSS, npm 패키지 CSS, `<link>`, `<style is:inline>` | S2.3 | 글 페이지의 `<style>` 두 개와 KaTeX `<link>`                         |
| 8    | [07. 스크립트: is:inline, define:vars, 외부 위젯](07-scripts.md)            | 처리되는 `<script>`와 `is:inline`, `define:vars`             | S2.4 | `<head>`의 GA 스크립트 두 개, `</main>` 뒤의 utterances              |
| 9    | [08. 정적 엔드포인트와 404 페이지](08-endpoints-404.md)                     | `GET`을 export 하는 `.ts` 라우트, `404.astro`                | S2.5 | `dist/sitemap.xml`, `dist/404.html`                                  |
| 10   | [10. SEO 메타 태그와 구조화 데이터](10-seo-meta.md)                         | 페이지 → 레이아웃 → 컴포넌트로 내려가는 props, `set:html`    | U2\* | `<meta name="robots">`, `og:*`, `application/ld+json`                |
| 11   | [11. 타입 검사와 린트](11-typecheck-and-lint.md)                            | `astro sync`, `@astrojs/check`, TypeScript 7                 | U1\* | `dist/`는 그대로다. 설치 결과(`npm ls typescript`)를 본다            |

\* U1·U2는 계획을 세운 뒤에 생긴 "리뷰 코멘트 반영" 단계라 PLAN.md의 단계 표에는 없고, 진행 보드(`scripts/progress/plan.json`)에 있다. 나머지 단계 id는 [PLAN.md](PLAN.md)의 것이다.

## 실험을 안전하게 돌리기

- **깨끗한 트리에서 시작한다.** `git status --short`가 비어 있어야 한다. `npm run verify`를 쓰는 실험은 `.verify/baseline`이 필요하니 `npm run verify:setup`을 먼저 한 번 돌린다.
- **실험이 고친 추적 파일은 끝나면 되돌린다.** `git checkout <파일>`(또는 `git checkout src`), `git mv`로 옮긴 파일은 반대로 `git mv`, `posts/`에 만든 픽스처(`zz-…md`)는 지운다. 마지막에 `git status --short`가 다시 비어야 한다.
- **`dist/`, `.astro/`, `node_modules/.astro/`, `.verify/report/`는 추적되지 않는다.** 실험 뒤 `npm run build`(또는 `npm run verify`)를 한 번 돌려 깨끗한 빌드로 되돌린다.
- **`npm run -s verify -- …`는 매번 `astro build --force`로 처음부터 빌드한다.** `--no-check`는 타입 검사를 건너뛴다. 실패의 자세한 내용은 `.verify/report/<검사>.json`에 있다. 이렇게 돌린 결과는 scope `local`로 기록되어 진행 보드의 통합 결과를 바꾸지 않는다.
- **그냥 `npm run build`는 내용 저장소(`node_modules/.astro/data-store.json`)를 재사용한다.** 글과 설정이 바뀐 것은 알아채지만 플러그인 패키지 버전이 바뀐 것은 모른다(04). 의심되면 `npx astro build --force`.
- **실험은 `astro dev`·`astro preview` 없이 돌도록 적었다.** 브라우저가 필요한 확인은 verify의 브라우저 검사(`embeds`, `hover`, `visual`)나 07의 Playwright 한 줄로 한다.

## 함께 보는 문서

- [`_refs/`](_refs/): 문서 스카우트가 공식 문서를 읽고 정리한 요약 6개. 노트의 "문서 근거"가 가리키는 문서를 주제별로 모았다.
  [구조·설정](_refs/structure-config.md) · [컴포넌트·레이아웃·스타일](_refs/components-layouts-styles.md) · [콘텐츠 컬렉션](_refs/content-collections.md) · [라우팅·엔드포인트](_refs/routing-endpoints.md) · [마크다운](_refs/markdown-pipeline.md) · [스크립트·배포](_refs/scripts-deploy.md)
- [PLAN.md](PLAN.md): 개편 계획. 단계 id, 검증 장치 설계, 노트 형식이 여기서 왔다.
- [`scripts/verify/README.md`](../../scripts/verify/README.md): 실험에 쓰는 `npm run verify`의 플래그와 검사 목록.
