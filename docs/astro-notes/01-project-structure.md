# 01. 프로젝트 구조, CLI, 설정

## 한 줄 요약

Astro가 예약한 폴더는 `src/pages/` 하나뿐이고, 지금 배포본과 같은 URL 모양(`/posts/<id>` ← `posts/<id>.html`)은 `astro.config.mjs`의 세 줄로 정해진다.

## 개념

- **예약된 것은 `src/pages/`뿐이다.** `src/layouts`, `src/components`, `src/lib`는 관례라서 이름을 바꿔도 된다. `public/`은 가공 없이 `dist/`로 복사된다. 페이지 파일을 `.page.tsx`로 구분하던 `pageExtensions` 같은 장치는 필요 없다.
- **`.astro` 파일은 빌드 때 한 번 도는 함수다.** `---` 펜스 안은 Node에서 실행되는 TypeScript이고 그 아래는 HTML 템플릿이다. React 컴포넌트와 달리 브라우저로 내려가는 코드가 없어서 hydration도 `_app`도 없다.
- **`astro.config.mjs`의 다섯 값**
  - `site`: 배포 주소. `Astro.site`의 값이 된다.
  - `build.format: "file"`: `src/pages/posts/x.astro` → `dist/posts/x.html`. 기본값 `"directory"`는 `dist/posts/x/index.html`을 만들고, GitHub Pages는 그때 `/posts/x`를 `/posts/x/`로 301 보낸다. "기존 URL은 리다이렉트 없이 200"이라는 제약 때문에 `"file"`을 쓴다.
  - `trailingSlash: "never"`: 문서가 `"file"`과 함께 쓰라고 권하는 값.
  - `markdown`: `config/markdown.mjs`의 default export(`syntaxHighlight: false`와 unified 프로세서, 04)를 그대로 넣는다.
  - `vite.build.cssTarget`: 미디어 쿼리를 배포본처럼 `(max-width:600px)`로 내보내게 CSS 대상 브라우저를 낮춘다(06).
- **v7 기본값 `compressHTML: "jsx"`**: 요소 사이의 줄바꿈과 들여쓰기를 JSX처럼 버린다. 템플릿을 여러 줄로 써도 태그는 한 줄로 이어진다.
- **CLI**: `npm run check`는 `astro sync` 뒤 `astro check`와 같은 검사기(`@astrojs/check`)를 `tools/astro-check`에서 부른다(`astro check` 명령은 TypeScript 7을 거부한다, 11). `.astro`뿐 아니라 tsconfig에 걸린 `.ts`, `.mjs`도 세므로 `Result (N files)`의 N이 `.astro` 파일 수(11)보다 훨씬 크다. `npm run build`는 `dist/`를 만들고, 스스로 `astro sync`를 먼저 돌려 `.astro/types.d.ts`를 만든다.
- **`tsconfig.json`**: `astro/tsconfigs/strict`를 extends 하고 `noUnusedLocals`, `noUnusedParameters`를 켠다. `include`의 `.astro/types.d.ts`로 생성된 타입이 잡힌다.

## Next.js 대응

| 예전 (`git show main:<경로>`)                                                                                   | 지금                                                         |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `next.config.js` (`pageExtensions`), `next build && next export`                                                | `astro.config.mjs` + `config/markdown.mjs`, `astro build`    |
| `pages/_document.page.tsx`의 `<Html lang="ko">`, `pages/_app.page.tsx`의 viewport 메타, `components/layout.tsx` | `src/layouts/BaseLayout.astro`                               |
| 페이지마다 복사해 둔 `<Head>` 메타 묶음                                                                         | `src/components/Seo.astro`의 `Props` (05, 10)                |
| `_document`의 폰트·KaTeX 링크, `_app`의 GA `<Script>`                                                           | `src/components/HeadAssets.astro`(09), `Analytics.astro`(07) |
| 여러 파일에 문자열로 흩어진 제목·설명·GA ID                                                                     | `src/lib/site.ts`의 `SITE`                                   |
| Next 기본 404 화면                                                                                              | `src/pages/404.astro`                                        |
| `tsconfig.json` (`target: es5`, `jsx: preserve` 등 옵션 14개)                                                   | `extends: "astro/tsconfigs/strict"`                          |
| `out/`                                                                                                          | `dist/`                                                      |

`{children}`은 `<slot />`이 되고 `<Layout home>`은 `<BaseLayout seo={…} home>`이 된다.

## 빌드 결과물에서 확인하기

- `dist/index.html`, `dist/404.html`: 태그 사이에 공백이 없다. 줄바꿈은 `is:inline`으로 쓴 `<style>`·`<script>` 안에만 남는다(그래서 `wc -l`은 수십 줄이다). `<!DOCTYPE html><html lang="ko" …><head><meta charset="utf-8"><meta name="viewport" …><title>…</title>…`의 순서가 `BaseLayout.astro`에 적은 순서와 같다.
- `grep -o '<script' dist/index.html | wc -l` → 3(JSON-LD, GA 로더, gtag 설정. 셋 다 `is:inline`, 07·10). 배포본 `.verify/baseline/index.html`에는 10개(`/_next/` 청크 9개 + `__NEXT_DATA__`)다. `grep -c`는 줄 수를 세므로 이 비교에 쓰지 않는다. `dist/`에는 `_astro/` 폴더가 없다. Astro가 묶어 낸 JS·CSS 파일이 하나도 없다는 뜻이다.
- `public/`의 7개 파일(`favicon.ico`, `robots.txt`, `profile.webp` 등)이 `dist/` 최상위에 그대로 있다.

## 닫힌 고리가 잡아낸 것

- **빈 프로젝트의 빌드는 성공한다.** `src/pages`가 없을 때 `astro build`는 경고(`Missing pages directory: src/pages`)만 내고 `0 page(s) built`, exit 0으로 끝난다. 빌드 성공만 보면 통과로 착각한다 → 라우트 집합 비교(`scripts/verify/lib/resolve.mjs`의 `listRoutes`)가 "missing 14개"로 잡았다.
- **`as const`와 `string[]`의 충돌**(구현 전에 예상했고 일부러 재현해 확인): `SITE.keywords`를 `as const` 객체 안에 배열 리터럴로 쓰면 `readonly [...]` 튜플이 되어 `Seo`의 `keywords: string[]`에 넘길 때 `ts(4104)`가 난다 → `site.ts`에서 `const keywords: string[]`을 먼저 선언하고 참조한다.
- 그 밖에 이 단계에서 `check`·`build`가 실패한 적은 없다.

## 직접 해볼 실험

1. `astro.config.mjs`에서 `build: { format: "file" },` 줄을 지우고 `npm run build && find dist -name '*.html'`.
   <details><summary>예상 결과</summary>글이 `dist/posts/<id>/index.html` 12개로 바뀐다. `dist/index.html`과 `dist/404.html`은 그대로다. 줄을 되돌려 놓는다.</details>
2. `astro.config.mjs`에 `compressHTML: false,`를 넣고 빌드한 뒤 `cat dist/404.html`.
   <details><summary>예상 결과</summary>템플릿의 줄바꿈과 들여쓰기가 살아 있는 여러 줄 HTML이 나온다(`wc -l`이 두 배 가까이 는다). 값이 `false`나 `null`인 표현식 자리(`Seo`의 `article:*`와 JSON-LD, `Header`의 `{home && …}`)는 빈 줄로 남는다. 줄을 되돌려 놓는다.</details>
3. `src/lib/site.ts` 끝에 `export const broken: number = "x";`를 붙이고 `npm run check`.
   <details><summary>예상 결과</summary>`src/lib/site.ts … error ts(2322)`와 `1 error`가 나오고 exit 1이다. `@astrojs/check`가 `.ts`도 본다는 뜻이다. 줄을 지운다.</details>

## 문서 근거

- https://docs.astro.build/en/basics/project-structure/
- https://docs.astro.build/en/reference/configuration-reference/ (`site`, `trailingSlash`, `build.format`, `compressHTML`)
- https://docs.astro.build/en/reference/cli-reference/ (`astro check`, `astro build`, `astro sync`)
- https://docs.astro.build/en/guides/typescript/ (tsconfig 프리셋)
- 문서에 없어 직접 확인한 것: `"file"`에서 `index.astro` → `index.html`, `404.astro` → `404.html`, `posts/[id].astro` → `posts/<id>.html`.
