# 06. 스타일: 전역 CSS, scoped style, :global()

## 한 줄 요약

styled-components 4개 파일(`global-style.ts`, `layout.style.ts`, `header.style.ts`, `index.style.ts`)이 `src/styles/global.css` 하나와 컴포넌트마다의 `<style>` 블록이 됐고, 홈은 세 뷰포트(375·768·1280)에서 배포본과 픽셀이 하나도 다르지 않다(`visual 3/3`). 글 본문(`[id].style.ts`)은 아직 옮기지 않았다.

## 개념

- **`.astro`의 `<style>`은 기본이 scoped다.** 빌드가 컴포넌트 파일마다 id를 하나 만들어 그 템플릿의 요소에 `data-astro-cid-<해시>` 속성을 붙이고(`<head>`와 그 안의 태그는 빼고), 선택자의 각 단계에도 같은 속성을 붙인다. `Footer.astro`의 `footer { … }`는 `footer[data-astro-cid-…]{…}`가 되어 다른 파일의 `<footer>`에는 걸리지 않는다. 그래서 클래스 이름 없이 `header`, `footer`, `section`, `article h2`처럼 요소 이름만 써도 안전하다.
- **스코프는 자식 컴포넌트 안으로 들어가지 않는다.** `index.astro`의 `<section>` 안에 있는 `<a>`는 `PostHeader.astro`가 그린 것이라 `PostHeader`의 id를 갖는다. `index.astro`에서 `section a:hover`라고 쓰면 `a[index의 id]`를 찾으므로 영영 맞지 않는다.
- **`:global()`은 선택자의 일부만 스코프에서 뺀다.** `section :global(a:hover)` → `section[data-astro-cid-…] a:hover`. "내 `<section>` 아래라면 누가 그린 `<a>`든"이라는 뜻이다. 자식 컴포넌트나 `<Content />`가 그린 Markdown처럼 내 템플릿에 없는 요소를 꾸밀 때 쓴다.
- **`<style is:global>`은 블록 전체를 스코프 없이 낸다.** 그 컴포넌트가 한 번이라도 쓰인 페이지의 모든 요소에 걸린다. 이 저장소에는 쓴 곳이 없다.
- **import 한 `.css`는 전역이다.** `BaseLayout.astro` 펜스의 `import "../styles/global.css"`가 `createGlobalStyle` + `<GlobalStyle />`를 대신한다. 맨 위에 import 해서 묶음 안에서 컴포넌트 스타일보다 앞에 오게 했다.
- **누가 이기나**: 같은 요소에 `global.css`의 `footer { display: block }`과 scoped `footer[data-astro-cid-…] { display: flex }`가 함께 걸린다. scoped 쪽이 속성 선택자만큼 특이도가 높아서 이긴다(`scopedStyleStrategy` 기본값 `"attribute"`).
- **CSS가 놓이는 곳**: 페이지는 자기가 쓴 컴포넌트의 CSS만 받는다. 묶음(chunk)이 `vite.build.assetsInlineLimit`(4096바이트)보다 작으면 `<head>` 끝의 `<style>`로 인라인되고, 크면 `dist/_astro/<이름>.<해시>.css`가 되어 `<link rel="stylesheet">`로 걸린다(`build.inlineStylesheets` 기본값 `"auto"`). 지금은 가장 큰 묶음이 3,169바이트라 전부 인라인이다.
- **값은 그대로, 표기는 바뀐다.** Vite 8의 LightningCSS가 줄이면서 `@media (max-width: 600px)`를 `@media (width<=600px)`로, `"Apple SD Gothic Neo"`를 따옴표 없이, `black`을 `#000`으로 쓴다.

## Next.js 대응

| 예전 (`git show main:<경로>`)                                                                                                | 지금                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `styles/global-style.ts`의 `createGlobalStyle`, `pages/_app.page.tsx`의 `<GlobalStyle />`                                    | `src/styles/global.css`, `BaseLayout.astro`의 `import`                                                                          |
| `components/layout.style.ts`의 `Body`, `Footer`                                                                              | `BaseLayout.astro`의 `.layout`, `Footer.astro`의 `footer`                                                                       |
| `components/header.style.ts`의 `Container`, `Title`, `A`, `ProfileWrapper`, `Profile`, `LinkList`, `EmailLink`, `GithubLink` | `Header.astro`의 `header`, `.title`, `.title-link`, `.profile-wrapper`, `.profile`, `.link-list`, `.email-link`, `.github-link` |
| `pages/index.style.ts`의 `Section`                                                                                           | `src/pages/index.astro`의 `section`, `section :global(a:hover)`                                                                 |
| `pages/index.style.ts`의 `Article` (홈과 글 페이지가 import)                                                                 | `PostHeader.astro`의 `article h2`, `article time`, `article p`                                                                  |
| `pages/posts/[id].style.ts`의 `Main`                                                                                         | 아직 없다(다음 단계). `<main>`은 스타일이 없다                                                                                  |
| 생성된 클래스 `.jzwiwO`, `&:hover`·`li a { … }` 중첩                                                                         | 요소에 붙는 `data-astro-cid-…` 속성. 선택자는 배포본에 실제로 나간 모양대로 펼쳐 썼다                                           |
| `pages/_document.page.tsx`의 `ServerStyleSheet`, 브라우저로 가는 styled-components 런타임                                    | 없다. 빌드가 CSS를 모아 `<head>`에 넣고 JS는 0바이트다                                                                          |

배포본에서도 맞는 요소가 없던 규칙 2개(`A`의 `&:hover p span`, `Article`의 `p`)도 주석을 달아 그대로 옮겼다.

## 빌드 결과물에서 확인하기

- `grep -c '<style' dist/index.html` → 1, `ls dist/_astro` → 없다. `<style>` 크기는 홈 3,830바이트, 글 3,658바이트, `404.html` 3,170바이트다(배포본 홈은 `<style>` 2개에 8,016바이트).
- `grep -o '<footer[^>]*>' dist/index.html` → `<footer data-astro-cid-…>`. `<html>`, `<body>`, `<div class="layout">`는 `BaseLayout`의 id를, `<article>`·`<a>`·`<h2>`·`<time>`은 `PostHeader`의 id를 갖는다.
- `grep -o 'section\[[^{]*hover' dist/index.html` → `section[data-astro-cid-…] a:hover`. `:global()` 안쪽에는 속성이 붙지 않았다.
- `grep -o '@media[^{]*' dist/index.html | sort | uniq -c` → `(width<=375px)` 3, `(width<=600px)` 3, `(width<=767px)` 1.

## 닫힌 고리가 잡아낸 것

- Red는 `visual 0/3`(`375: size 375x1474 ≠ 543x2108`, `768: height 1899 ≠ 1963 (+64)`), 구현 뒤 첫 실행에서 `3/3`이다. 글 페이지의 `--selector=header`와 `--selector=article`도 `3/3`이다.
- **화면 비교는 hover를 못 본다.** `:global()`을 빼도 `visual 3/3`이 그대로 나온다. 일회용 Playwright 스크립트로 홈의 header·목록·footer 요소의 computed style을 세 뷰포트와 hover 상태(제목, 아이콘 2개, 글 링크)에서 비교했더니 `:global()`이 없을 때만 `text-decoration: underline vs none`이 나왔다. 지금은 차이 0이다(styled-components가 붙이던 `-webkit-box-*` 접두사 속성은 제외).
- **import 순서**: 처음에는 `global.css`를 컴포넌트 import 뒤에 두었다 → 묶음에서 `footer{display:block}`이 `footer[…]{display:flex}` 뒤에 놓였다. 기본 전략에서는 특이도로 이겨 통과하지만 `scopedStyleStrategy: "where"`(특이도 0)로 빌드하면 `visual 0/3` → import를 맨 위로 옮겼다. 이제 `"where"`에서도 `3/3`이다.
- **글 페이지의 `--selector=footer`는 `diff 1.38%`로 실패한다.** 스타일 차이가 아니다. 본문이 아직 달라 footer의 y가 배포본 2509.6875, 새 빌드 1842.25로 소수점 자리가 다르고 글자의 안티앨리어싱이 달라진다. 본문이 맞으면 사라진다.
- **미디어 쿼리 표기**: `(width<=600px)`는 Safari 16.4부터 읽는다. 그보다 오래된 Safari에서는 모바일 규칙이 빠진다. `vite.build.cssTarget: ["chrome87", "safari14"]`로 빌드하면 `(max-width:600px)`로 남고 `visual 3/3`인 것까지 확인했다. `astro.config.mjs`는 이 단계의 범위가 아니라 고치지 않았다.

## 직접 해볼 실험

1. `src/pages/index.astro`의 `section :global(a:hover)`를 `section a:hover`로 바꾸고 `npm run build`, `grep -o 'section\[[^{]*hover' dist/index.html`, `grep -o '<article[^>]*><a[^>]*>' dist/index.html | head -1`. 이어서 `npm run -s verify -- --only=visual --route=/ --no-check`.
   <details><summary>예상 결과</summary>선택자는 `section[data-astro-cid-A] a[data-astro-cid-A]:hover`인데 `<a>`의 속성은 `PostHeader`의 `data-astro-cid-B`다. 두 id가 달라서 제목에 마우스를 올려도 밑줄이 생기지 않는다. 그런데도 검사는 `PASS visual 3/3`이다. 스크린샷은 마우스를 올리지 않는다.</details>
2. `src/components/Footer.astro`의 `<style>`을 `<style is:global>`로 바꾸고 빌드한 뒤 `grep -o '<footer[^>]*>' dist/index.html`.
   <details><summary>예상 결과</summary>`<footer>`. 속성이 사라지고 CSS는 `footer{border-top:…;display:flex}`가 된다. `global.css`의 `footer{display:block}`보다 뒤에 있어서 화면은 그대로다(`visual 3/3`). 대신 이제 Markdown 본문 안의 `<footer>`에도 걸린다.</details>
3. `astro.config.mjs`의 `build`를 `{ format: "file", inlineStylesheets: "never" }`로 바꾸고 빌드한 뒤 `ls -l dist/_astro`, `grep -o '<link rel="stylesheet"[^>]*>' dist/index.html dist/404.html`.
   <details><summary>예상 결과</summary>`BaseLayout.<해시>.css`(3,170바이트: `global.css` + Footer + Header + `.layout`), `PostHeader.<해시>.css`(488), `index.<해시>.css`(172)가 생긴다. 홈은 셋 다, 글은 앞의 둘, `404.html`은 `BaseLayout` 것만 `<link>`로 건다. `<style>`은 없고 화면은 같다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/styling/ (scoped, `:global()`, `is:global`, CSS import, 우선순위)
- https://docs.astro.build/en/reference/directives-reference/ (`is:global`)
- https://docs.astro.build/en/reference/configuration-reference/ (`scopedStyleStrategy`, `build.inlineStylesheets`)
- 요약과 달랐던 것: 요약은 "import 한 CSS < scoped `<style>`"의 순서를 말하지만 묶음 안의 실제 순서는 import 순서다. scoped가 이기는 것은 특이도 때문이다.
- 문서에 없어 직접 확인한 것: CSS 파일의 위치(`dist/_astro/`), 인라인 판단이 묶음 단위인 것, `<html>`·`<body>`에는 속성이 붙고 `<head>` 안에는 붙지 않는 것, 미디어 쿼리 표기가 바뀌는 것.
