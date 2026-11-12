# Astro 학습 노트

Next.js 13 블로그를 Astro 7로 옮기면서 단계마다 하나씩 쓴 노트다. 모든 노트는 같은 일곱 절(한 줄 요약 → 개념 → Next.js 대응 → 빌드 결과물에서 확인하기 → 닫힌 고리가 잡아낸 것 → 직접 해볼 실험 → 문서 근거)로 되어 있고, `node scripts/notes-lint.mjs`가 그 모양을 검사한다.

## 읽는 순서

번호는 쓴 순서다. 아래 순서로 읽으면 앞 노트가 뒤 노트의 바탕이 된다.

| 순서 | 노트                                                                        | Astro 개념                                                    | 단계 | `dist/`에서 볼 곳                                                    |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------- | ---- | -------------------------------------------------------------------- |
| 1    | [01. 프로젝트 구조, CLI, 설정](01-project-structure.md)                     | 예약 폴더 `src/pages/`, `astro.config.mjs`, `build.format`    | S1.1 | `find dist -name '*.html'`: `posts/<id>.html` 모양, `_astro/`가 없다 |
| 2    | [05. 컴포넌트, props, 레이아웃, slot, head 태그](05-components-layouts.md)  | `.astro` 컴포넌트, `Astro.props`, `<slot />`                  | S1.2 | `dist/index.html`의 `<head>` 순서와 `<div class="layout">`           |
| 3    | [06. 스타일: 전역 CSS, scoped style, :global()](06-styles.md)               | scoped `<style>`, `:global()`, CSS 묶음과 인라인              | S1.4 | `data-astro-cid-…` 속성, `</head>` 바로 앞의 인라인 `<style>`        |
| 4    | [02. 콘텐츠 컬렉션: 로더, 스키마, getCollection](02-content-collections.md) | `glob()` 로더, Zod 스키마, `getCollection`                    | S1.3 | 홈 `<section>`의 `<article>` 12개와 `<time datetime>`                |
| 5    | [03. 동적 라우트: getStaticPaths와 render()](03-dynamic-routes.md)          | `[id].astro`, `getStaticPaths()`, `render()`                  | S2.1 | `dist/posts/`의 파일 12개, `<main class="prose">`                    |
| 6    | [04. 마크다운 파이프라인](04-markdown-pipeline.md)                          | `markdown.processor`(unified), remark·rehype 플러그인         | S2.2 | 글 페이지의 `<code class="hljs …">`, `class="katex"`                 |
| 7    | [09. 글 본문 스타일](09-post-styles.md)                                     | import 한 CSS, npm 패키지 CSS, `<link>`, `<style is:inline>`  | S2.3 | 글 페이지의 `<style>` 두 개와 KaTeX `<link>`                         |
| 8    | [07. 스크립트: is:inline, define:vars, 외부 위젯](07-scripts.md)            | 처리되는 `<script>`와 `is:inline`, `define:vars`              | S2.4 | `<head>`의 GA 스크립트 두 개, `</main>` 뒤의 utterances              |
| 9    | [08. 정적 엔드포인트와 404 페이지](08-endpoints-404.md)                     | `GET`을 export 하는 `.ts` 라우트, `404.astro`                 | S2.5 | `dist/sitemap.xml`, `dist/404.html`                                  |
| 10   | [10. SEO 메타 태그와 구조화 데이터](10-seo-meta.md)                         | 페이지 → 레이아웃 → 컴포넌트로 내려가는 props, `set:html`     | U2\* | `<meta name="robots">`, `og:*`, `application/ld+json`                |
| 11   | [11. 타입 검사와 린트](11-typecheck-and-lint.md)                            | `astro sync`, `@astrojs/check`, TypeScript 7                  | U1\* | `dist/`는 그대로다. 설치 결과(`npm ls typescript`)를 본다            |
| 12   | [12. Sätteri와 Shiki: 기본 마크다운 엔진으로 옮기기](12-satteri-shiki.md)   | `satteri()` 처리기, Shiki 듀얼 테마(CSS 변수), `features.gfm` | S4.1 | 글 페이지의 `<pre class="astro-code …" data-language>`               |
| 13   | [13. Fonts API 와 서드파티 CSS 자체 호스팅](13-fonts-third-party-css.md)    | `fonts` 설정과 `<Font>`, npm 패키지 CSS import                | S4.2 | `dist/_astro/fonts/`, `--font-source-code-pro`                       |
| 14   | [14. astro:assets 로 이미지 최적화하기](14-image-assets.md)                 | `<Picture />`, Markdown 이미지 최적화, mdast 플러그인         | S4.3 | 글 페이지 `<img src="/_astro/….webp" srcset>`                        |
| 15   | [15. 초안: import.meta.env.DEV, 컬렉션 필터, dev 전용 컬렉션](15-drafts.md) | `import.meta.env.DEV`, `getCollection` 필터                   | S4.4 | `grep -rl "초안" dist` → 없음                                        |
| 16   | [16. 태그 페이지: 컬렉션에서 동적 라우트 파생](16-tag-pages.md)             | 컬렉션에서 파생한 `getStaticPaths()`, 한글 슬러그             | S5.1 | `dist/tags/`, 글 머리 아래 `nav.post-tags`                           |
| 17   | [17. 시리즈: file() 로더와 reference()](17-series-file-loader-reference.md) | `file()` 로더, `reference()`, `getEntries()`                  | S5.2 | css-masters-2 글의 `<nav aria-label="시리즈">`                       |
| 18   | [18. 목차와 읽는 시간: render()의 headings](18-toc-reading-time.md)         | `render()`가 돌려주는 `headings`                              | S5.3 | 글 페이지의 `<nav aria-label="목차">`, `p.reading-time`              |
| 19   | [19. RSS: 엔드포인트와 `@astrojs/rss`](19-rss.md)                           | 정적 엔드포인트, `@astrojs/rss`의 `rss()`                     | S5.4 | `dist/rss.xml`, `<link rel="alternate" type="application/rss+xml">`  |
| 20   | [20. MDX: `.mdx` 초안에서 컴포넌트 쓰기](20-mdx.md)                         | `@astrojs/mdx`, `mdx({ processor })`                          | S5.5 | `dist/`는 그대로다(초안). `astro dev`의 `/posts/mdx-demo`            |

\* U1·U2는 계획을 세운 뒤에 생긴 "리뷰 코멘트 반영" 단계라 PLAN.md의 단계 표에는 없고, 진행 보드(`scripts/progress/plan.json`)에 있다. 나머지 단계 id는 [PLAN.md](PLAN.md)의 것이다.

## 실험을 안전하게 돌리기

- **깨끗한 트리에서 시작한다.** `git status --short`가 비어 있어야 한다. `npm run verify`를 쓰는 실험은 `.verify/baseline`이 필요하니 `npm run verify:setup`을 먼저 한 번 돌린다.
- **실험이 고친 추적 파일은 끝나면 되돌린다.** `git checkout <파일>`(또는 `git checkout src`), `git mv`로 옮긴 파일은 반대로 `git mv`, `posts/`에 만든 픽스처(`zz-…md`)는 지운다. 마지막에 `git status --short`가 다시 비어야 한다.
- **`dist/`, `.astro/`, `node_modules/.astro/`, `.verify/report/`는 추적되지 않는다.** 실험 뒤 `npm run build`(또는 `npm run verify`)를 한 번 돌려 깨끗한 빌드로 되돌린다.
- **`npm run -s verify -- …`는 매번 `astro build --force`로 처음부터 빌드한다.** `--no-check`는 타입 검사를 건너뛴다. 실패의 자세한 내용은 `.verify/report/<검사>.json`에 있다. 이렇게 돌린 결과는 scope `local`로 기록되어 진행 보드의 통합 결과를 바꾸지 않는다.
- **그냥 `npm run build`는 내용 저장소(`node_modules/.astro/data-store.json`)를 재사용한다.** 글과 설정이 바뀐 것은 알아채지만 플러그인 패키지 버전이 바뀐 것은 모른다(04). 의심되면 `npx astro build --force`.
- **실험은 `astro dev`·`astro preview` 없이 돌도록 적었다.** 브라우저가 필요한 확인은 verify의 브라우저 검사(`embeds`, `hover`, `visual`)나 07의 Playwright 한 줄로 한다.

## 함께 보는 문서

- [`_refs/`](_refs/): 문서 스카우트가 공식 문서를 읽고 정리한 요약 15개. 노트의 "문서 근거"가 가리키는 문서를 주제별로 모았다.
  [구조·설정](_refs/structure-config.md) · [컴포넌트·레이아웃·스타일](_refs/components-layouts-styles.md) · [콘텐츠 컬렉션](_refs/content-collections.md) · [라우팅·엔드포인트](_refs/routing-endpoints.md) · [마크다운](_refs/markdown-pipeline.md) · [스크립트·배포](_refs/scripts-deploy.md) · [Sätteri·Shiki](_refs/markdown-shiki.md) · [Fonts API](_refs/fonts.md) · [이미지](_refs/assets.md) · [초안](_refs/drafts.md) · [태그](_refs/tags.md) · [시리즈](_refs/series.md) · [목차](_refs/toc.md) · [RSS](_refs/rss.md) · [MDX](_refs/mdx.md)
- [PLAN.md](PLAN.md): 개편 계획. 단계 id, 검증 장치 설계, 노트 형식이 여기서 왔다.
- [`scripts/verify/README.md`](../../scripts/verify/README.md): 실험에 쓰는 `npm run verify`의 플래그와 검사 목록.

## 작업 브랜치(astro)

이 노트, 계획, 진행 대시보드, 릴리스 스크립트는 Next.js에서 Astro로 옮기는 작업에만 쓰는 1회성 도구라서 `main`에 들어가지 않는다. 검증 장치(`scripts/verify/`)는 배포 전마다 CI가 돌리는 상시 도구라서 `main`에도 들어간다. 저장소 루트의 README와 CI·배포 워크플로는 두 브랜치에서 같다.

### 브랜치

| 브랜치           | 담은 것                                                                                                                                                                                         | `main`에 머지                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `main`           | 제품과 상시 도구(검증 장치). push하면 CI와 같은 검사를 거쳐 GitHub Pages에 배포된다                                                                                                             | —                                                           |
| `astro`          | `main`의 것에 더해 1회성 도구: `docs/`, `scripts/progress/`, `scripts/release.mjs`, `scripts/notes-lint.mjs`, 그것들을 부르는 npm 스크립트(`progress`, `progress:watch`), 그 경로의 ignore 항목 | 하지 않는다. 작업 브랜치이자 학습 기록으로 남는다           |
| `release/<이름>` | `scripts/release.mjs`가 `astro`에서 1회성 도구를 빼고 만든 트리. `origin/main` 위의 커밋 하나다                                                                                                 | 이것만 한다. PR로 올리고 체크포인트 승인 뒤 squash 머지한다 |

### 릴리스 만들기

깨끗한 `astro` 트리에서 돌린다(`git status --short`가 비어 있어야 한다). 스크립트는 push하지 않는다.

```sh
node scripts/release.mjs --branch=release/<이름> --dry-run   # 예행연습: 끝까지 검증하고 브랜치를 지운다
node scripts/release.mjs --branch=release/<이름>             # 같은 일을 하고 브랜치를 남긴다
git push -u origin release/<이름>                            # 그다음 main 으로 PR 을 연다
```

`--from=<ref>`(기본 `HEAD`)로 릴리스할 커밋을, `--message=<메시지>`(기본 `feat: 블로그를 Astro 로 옮긴다`)로 커밋 메시지를 고른다. 메시지 뒤에는 `Co-Authored-By` 줄이 붙는다. 한 단계에 한 줄을 찍고, 첫 실패에서 이유 한 줄과 함께 0이 아닌 코드로 끝난다. 일은 `os.tmpdir()` 아래의 임시 worktree에서 한다.

1. 작업 트리가 더럽거나 브랜치가 이미 있으면 거부한다. `git fetch origin main`.
2. `origin/main`에서 새 브랜치를 만들고, 추적 파일을 모두 지운 뒤 `git archive <from> | tar -x`로 `--from`의 트리를 푼다(트리 해시가 같은지 확인한다).
3. 1회성 도구(`docs/`, `scripts/progress/`, `scripts/release.mjs`, `scripts/notes-lint.mjs`)를 지운다. `package.json`에서 그것들을 부르는 npm 스크립트를 뺀다. 1회성 도구만 쓰는 devDependency가 있으면 `npm uninstall --package-lock-only`로 빼고 다른 패키지가 다시 풀리지 않았는지 확인한다(지금은 없다). `.gitignore`·`.prettierignore`·`.oxlintrc.json`에서 1회성 도구의 항목을 뺀다.
4. 검증한다.
   - (a) 뺀 경로·npm 스크립트·devDependency·ignore 항목이 남지 않았다.
   - (b) 어떤 추적 파일(`package-lock.json` 포함)도 1회성 도구를 언급하지 않는다(검증 장치가 대시보드를 부르는 곳도 없어야 한다). 찾는 이름과, 제품 글에서 오탐이 나지 않게 좁힌 방법은 스크립트의 `MENTIONS` 주석에 있다(예: `docs/`는 저장소 경로일 때만 찾고 MDN 주소 속 `/docs/`는 건너뛴다).
   - (c) 릴리스 트리에서 `npm ci`, `npm run lint`, `npm run typecheck`, `npm run check`, `npm run build`, `npx prettier --check .`, `npm run verify:setup`, `npm run verify`가 통과한다(`VERIFY_REPORTER=off`: 검증 장치가 대시보드 없이 혼자 동작해야 한다).
   - (d) 릴리스 트리의 `dist/`가 `--from`을 따로 체크아웃해 같은 명령으로 빌드한 `dist/`와 바이트 단위로 같다(`diff -r`).
5. 통과하면 커밋하고 브랜치, 커밋, `origin/main...<브랜치>`의 변경 요약, 최상위 경로를 찍는다. 임시 worktree는 성공해도 실패해도 지운다. npm 로그는 실패했을 때 남기고 경로를 찍는다.

`--compare-from=<ref>`는 (d)가 정말 차이를 잡는지 보는 자기 검사용이다. 비교 빌드만 다른 커밋으로 하고, `--dry-run`과 함께만 받는다.

### 릴리스가 머지된 뒤

`origin/main`을 `astro`에 다시 머지한다. 그래야 다음 릴리스 PR의 차이가 그 사이에 바뀐 것만 담는다.

```sh
git switch astro
git fetch origin
git merge origin/main
```

첫 머지에서는 릴리스가 바꾼 네 파일(`package.json`, `.gitignore`, `.prettierignore`, `.oxlintrc.json`)이 충돌한다. 두 브랜치가 갈라진 곳(Next.js 시절의 `main`)에서 양쪽이 같은 줄을 다르게 바꿨기 때문이다. 릴리스 쪽은 `astro`의 것에서 기계적으로 만든 것이므로 `astro` 쪽을 남긴다. 그 밖의 파일은 충돌 없이 `astro`와 같아진다(`git merge-tree`로 확인했다).

```sh
git checkout --ours -- package.json .gitignore .prettierignore .oxlintrc.json
git add package.json .gitignore .prettierignore .oxlintrc.json
git commit --no-edit
```

`main`에 릴리스가 아닌 커밋(예: 의존성 자동 업데이트)이 들어왔다면 그 파일은 `--ours`로 덮지 말고 손으로 합친다.

### 검증

현재 배포본(`origin/gh-pages`)을 기준선으로 삼아 새 빌드(`dist/`)와 비교한다.

```sh
npm run verify:setup      # node_modules 와 기준선(.verify/baseline) 준비
npm run verify            # npm run check → astro build --force → 기준선과 비교하는 검사와 새 빌드에만 거는 검사
npm run verify:selftest   # 기준선이나 빌드를 일부러 망가뜨려 검사기가 차이를 잡는지 확인
```

자세한 내용은 [scripts/verify/README.md](../../scripts/verify/README.md)에 있다. 같은 검사를 PR과 배포 때 CI(`.github/workflows/checks.yml`)도 돌린다. `astro`에서만 도는 것은 노트 형식 검사(`node scripts/notes-lint.mjs`)뿐이다. 노트는 배포되지 않는다.

`astro`에서 돌린 검증 결과는 대시보드에 기록된다. `npm run progress`가 `.verify/reporter.mjs`(검증 장치의 reporter 훅)를 만들어 두기 때문이다. 통합 결과로 남기려면 `PROGRESS_SCOPE=integration npm run verify`로 돌린다.

### 진행 대시보드

```sh
npm run progress         # http://localhost:4400 에서 진행 상황 보기
npm run progress:watch   # 진행 기록을 터미널에서 따라 보기
```

### 학습 노트

Next.js에서 Astro로 옮기며 배운 것을 이 디렉터리(`docs/astro-notes/`)에 적어 둔다. 위의 [읽는 순서](#읽는-순서)대로 읽는다.
