# 21. 다크 모드: CSS 변수, `is:inline`, `define:vars`

## 한 줄 요약

색을 `global.css`의 CSS 사용자 정의 속성(토큰)으로 모으고 `<html data-theme="dark">`에서 값만 바꾼다. `<head>` 맨 위의 `is:inline` 스크립트가 저장한 선택(localStorage `theme`) → `prefers-color-scheme` 순으로 첫 화면 전에 `data-theme`을 붙여 깜빡임이 없다. 토글은 진짜 `<button>`(`aria-label="다크 모드"`, `aria-pressed`)이고, utterances 댓글은 `github-dark`로 같이 바뀐다.

## 개념

- **CSS 사용자 정의 속성**: `:root { --color-text: #000 }`, `:root[data-theme="dark"] { --color-text: #e6edf3 }`. 컴포넌트의 scoped `<style>`은 `var(--color-text)`만 쓴다. scoped 스타일 안에서 바깥 조건을 걸 때는 `:global([data-theme="dark"]) .moon`처럼 `:global()`로 감싼다.
- **라이트 값은 예전 값 그대로**: 브라우저 기본값(캔버스 `#fff`, 글자 `#000`)까지 토큰으로 적었다. `box-shadow: 0 0 0 black` → `var(--color-text)`도 계산값이 `rgb(0, 0, 0)`로 같다.
- **Shiki 이중 테마**: `defaultColor: false`라 토큰마다 `--shiki-light`·`--shiki-dark`가 이미 있다. `code.css`가 `[data-theme="dark"]` 아래에서 `--shiki-dark*`를 고른다. 빌드 결과(HTML)는 바뀌지 않는다.
- **`is:inline`**: Astro가 처리하는 `<script>`는 번들된 `type="module"`이라 지연 실행된다. 그 사이 밝은 화면이 한 번 칠해진다(FOUC). `is:inline`은 쓴 자리에서 쓴 대로, 파싱을 멈추고 바로 돈다.
- **`define:vars`**: 서버 값(`themeKey`, utterances 테마 이름)을 인라인 스크립트에 넘긴다. `define:vars`는 `is:inline`을 함축하고 본문을 `(function(){ const themeKey = "theme"; … })();`로 감싼다. 밖에서 쓸 것은 `window.__theme`에 단다.
- **utterances**: `client.js`는 실행될 때 자기 `<script>`의 `theme` 속성을 읽는다. 태그는 기준선 그대로 `boxy-light`로 두고, `<head>` 스크립트의 MutationObserver가 파서가 그 태그를 넣는 순간 속성을 바꾼다(관찰 콜백은 마이크로태스크라 async 스크립트보다 먼저). 이미 뜬 iframe에는 `postMessage({ type: "set-theme", theme }, "https://utteranc.es")`.

## Next.js 대응

| Next.js                                                        | Astro (S6.1)                                                |
| -------------------------------------------------------------- | ----------------------------------------------------------- |
| `next-themes`의 `ThemeProvider`가 `<head>`에 스크립트를 넣는다 | `<script is:inline define:vars>`를 레이아웃 `<head>`에 직접 |
| `<html suppressHydrationWarning>`(서버와 다른 `class` 때문)    | 하이드레이션이 없어 경고도 없다                             |
| `next/script`의 `strategy="beforeInteractive"`                 | `is:inline`(번들·지연 없음)                                 |
| CSS Modules·styled-components의 `ThemeProvider`로 색 값 넘기기 | CSS 변수 + `:global([data-theme])`                          |
| 토글은 클라이언트 컴포넌트(`"use client"`)와 `useTheme()`      | `.astro` 안의 `<script>`(번들 모듈) 몇 줄                   |

## 빌드 결과물에서 확인하기

- `dist/index.html`의 `<head>`: `<meta viewport>` 바로 뒤에 `<script>(function(){const themeKey = "theme";`. 스타일시트 `<link>`는 `<head>` 끝에 있다.
- `dist/_astro/BaseLayout.*.css`: `:root{…color-scheme:light;--color-bg:#fff;…}`, `:root[data-theme=dark]{…}`. Lightning CSS가 `color-scheme` 옆에 `--lightningcss-light`/`-dark`를 더한다.
- `npm run verify -- --only=theme`: 첫 화면(31개 라우트), 다크 대비(axe `color-contrast` 0), 저장한 선택, 토글(키보드), utterances. 자기 검사 변이 7개를 모두 잡는다.
- 라이트 화면 비교: 다른 픽셀은 모든 뷰포트에서 토글 상자(40×40, 오른쪽 위)뿐이었다(`visual` 실패 줄의 bbox).

## 닫힌 고리가 잡아낸 것

- **가설 1(실패)**: "DOMContentLoaded에서 `<html>` 배경을 읽으면 첫 화면 색이다." 모든 라우트가 `rgba(0, 0, 0, 0)`. 스타일시트 `<link>`가 `<head>` 끝에 있고 뒤에 스크립트가 없어서 DOMContentLoaded가 CSS보다 먼저 온다. 테마는 `<body>`가 문서에 들어오는 순간(그때까지 `<head>`의 스크립트는 다 돌았다)에, 배경은 load에서 읽도록 고쳤다.
- **가설 2(실패)**: "토글 JS를 막으려면 `/_astro/*.js` 요청을 끊으면 된다." Astro가 작은 모듈 스크립트를 HTML에 `<script type="module">`로 인라인해서 파일 요청이 없다. 검사는 문서에서 모듈 스크립트를 잘라 낸다.
- **mask**: 기준선에 없는 요소(토글)에 visual mask를 걸면 후보에만 색이 칠해져 그 상자가 그대로 차이가 된다(`paintMasks`는 각 쪽에서 선택자를 따로 찾는다).

## 직접 해볼 실험

끝나면 `git checkout src/`로 되돌린다.

1. `BaseLayout.astro`의 테마 `<script is:inline …>` 블록을 `<head>`에서 `</body>` 바로 앞으로 옮기고 `npm run verify -- --no-check --only=theme --route=/`.
   <details><summary>예상 결과</summary>동작은 같지만 본문이 먼저 칠해진다. `first-paint: data-theme when <body> was parsed: null, expected "dark"`로 실패한다(자기 검사의 첫 변이와 같다).</details>
2. `global.css`의 `:root[data-theme="dark"]`에서 `--color-muted`를 `#4b5157`로 바꾸고 같은 검사를 `/posts/proxy-to-built-in-objects`에 돌린다.
   <details><summary>예상 결과</summary>`contrast: color-contrast .reading-time …`. 읽는 시간 줄이 #0d1117 위에서 4.5:1을 넘지 못한다.</details>
3. 브라우저 개발자 도구에서 `localStorage.setItem("theme", "dark")` 후 새로 고침, 이어서 `localStorage.removeItem("theme")` 후 OS 다크 모드를 켰다 끈다.
   <details><summary>예상 결과</summary>앞은 시스템 설정과 상관없이 다크로 시작한다. 뒤는 저장한 선택이 없으므로 새로 고침 없이 시스템 설정을 따라 바뀐다(`matchMedia` change).</details>

## 문서 근거

- https://docs.astro.build/en/reference/directives-reference/#isinline (`is:inline`: 처리·번들하지 않고 그대로 출력)
- https://docs.astro.build/en/reference/directives-reference/#definevars (`define:vars`: `is:inline` 함축, 서버 값을 스크립트·스타일로)
- https://docs.astro.build/en/guides/styling/#global-styles (`:global()`)
- https://docs.astro.build/en/guides/syntax-highlighting/ (Shiki `themes`, `defaultColor: false`, `--shiki-dark`)
- https://developer.mozilla.org/en-US/docs/Web/CSS/color-scheme
