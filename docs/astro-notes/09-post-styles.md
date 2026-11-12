# 09. 글 본문 스타일: import 한 CSS, npm 패키지 CSS, `<link>`, `is:inline`

## 한 줄 요약

마지막 styled-components 파일(`pages/posts/[id].style.ts`)을 `src/styles/prose.css`로 옮기고, 남이 만든 CSS 셋(highlight.js 테마, KaTeX, Source Code Pro)을 각각 다른 길로 실었다. 이 단계의 게이트는 세 뷰포트 `visual 39/39`였고 이것으로 전체 게이트가 처음으로 ALL PASS가 됐다. 지금은 여섯 뷰포트, 색 허용 오차 0에서 홈과 글 12개가 배포본과 픽셀 하나 다르지 않다(`visual 78/78`).

## 개념

CSS가 페이지에 들어가는 길은 넷이고, 길마다 Astro가 손대는 정도가 다르다.

- **내 CSS 파일을 import** (`[id].astro`의 `import "../../styles/prose.css"`): 스코프 없이 전역으로 나가고, Vite가 줄여서 묶는다. `<Content />`가 그린 Markdown 요소에는 `data-astro-cid-…` 속성이 없어 scoped `<style>`이 닿지 않으므로 본문 스타일은 이 길로 보낸다. `<main class="prose">` 아래로만 걸리게 클래스 하나로 묶었다(`.iEffIV a` → `.prose a`, 특이도가 예전과 같다).
- **npm 패키지 안의 CSS를 import** (`import "highlight.js/styles/base16/monokai.css"`): 확장자까지 적으면 내 파일과 똑같이 처리된다. 어느 버전의 파일인지는 `package.json`이 정한다(11.5.1 고정).
- **`<link rel="stylesheet">`를 직접 쓰기** (`HeadAssets.astro`의 KaTeX, jsDelivr): Astro는 태그를 쓴 자리에 내보낼 뿐 받아 오지도 묶지도 않는다. 방문자의 브라우저가 받는다.
- **`<style is:inline>`** (`HeadAssets.astro`의 Source Code Pro `@font-face` 8개): 묶지도 줄이지도 않고 쓴 자리에 쓴 대로 나간다.
- **import 한 페이지에만 실린다.** 두 import는 글 페이지에 있어서 홈과 404에는 `hljs`도 `.prose`도 없다. `HeadAssets`는 레이아웃에 있어서 모든 페이지에 실린다(배포본도 KaTeX와 글꼴은 모든 페이지에 실었다).
- **묶음(chunk)은 "어느 페이지들이 쓰는가"로 나뉜다.** 모든 페이지가 쓰는 것(`global.css` + Header + Footer + `.layout`, 3,185바이트), 홈과 글이 쓰는 것(PostHeader, 494), 글만 쓰는 것(monokai + prose, 2,269). 인라인할지(4,096바이트 미만)는 묶음마다 따로 정하고, 인라인된 묶음들은 `<style>` 하나로 이어 붙인다. 그래서 글 페이지의 `<style>`은 5,948바이트인데도 인라인이다.
- **묶음의 순서는 import 순서를 따른다.** 묶음은 그 안에서 가장 먼저 import 된 파일의 자리에 놓인다. 두 import를 다른 import 뒤에 두어 `global.css` → 컴포넌트 → monokai → prose 순서가 되게 했다. 배포본에서도 본문 스타일이 맨 뒤였고, Astro 문서도 레이아웃을 먼저 import 하라고 권한다.

## Next.js 대응

| 예전 (`git show main:<경로>`)                                                                                          | 지금                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pages/posts/[id].style.ts`의 `Main`(`styled.main`)                                                                    | `src/styles/prose.css`의 `.prose …`, `[id].astro`의 `<main class="prose">`               |
| `[id].page.tsx`의 `import "highlight.js/styles/base16/monokai.css"` → `/_next/static/css/<해시>.css`를 `<link>`로 건다 | `[id].astro`의 같은 import → 글 페이지의 `<style>` 안에 인라인                           |
| `_document.page.tsx`의 KaTeX `<link>`                                                                                  | `HeadAssets.astro`의 같은 `<link>`(`integrity` 포함)                                     |
| `_document.page.tsx`의 Google Fonts `<link>` → Next.js의 글꼴 최적화가 빌드할 때 받아서 `<style data-href="…">`로 박음 | `HeadAssets.astro`의 `<style is:inline>`: 배포본에 박혀 있던 `@font-face` 8개(v22, woff) |
| `<link rel="preconnect">` 3개(googleapis 1, gstatic 2)                                                                 | gstatic 1개. googleapis로는 이제 요청이 가지 않는다                                      |

## 빌드 결과물에서 확인하기

- `ls dist/_astro` → 없다. `grep -c '<style' dist/index.html dist/404.html dist/posts/proxy-to-built-in-objects.html` → 셋 다 2(`@font-face` 2,976바이트 + 묶음: 홈 3,851, 404 3,292, 글 5,948바이트).
- `grep -o '<link rel="stylesheet"[^>]*>' dist/index.html | wc -l` → 1(KaTeX). 14개 페이지가 모두 같다.
- `grep -c hljs dist/index.html dist/404.html` → 둘 다 0. `grep -o '\.prose[^{]*{' dist/posts/proxy-to-built-in-objects.html | wc -l` → 12.
- 순서: `grep -o '\[hidden\]\|pre code\.hljs\|\.prose{' dist/posts/proxy-to-built-in-objects.html | tr '\n' ' '` → `[hidden] pre code.hljs .prose{`(global → monokai → prose).
- `grep -o '<main[^>]*>' dist/posts/proxy-to-built-in-objects.html` → `<main class="prose">`. `[id].astro`에 scoped `<style>`이 없어서 `data-astro-cid-…`가 붙지 않는다.

## 닫힌 고리가 잡아낸 것

이 절의 수치는 뷰포트가 3개(39 = 라우트 13 × 3)이고 색 허용 오차가 pixelmatch 기본값 0.1이던 때의 것이다.

- Red는 `visual 3/39`(`/posts/css-masters-2-week1`의 `375: size 375x6394 ≠ 694x4007`, `768: height 5241 ≠ 4135 (-1106)` 등), 구현 뒤 첫 실행에서 `39/39`다. 04·06번 노트가 함정을 미리 적어 둔 덕에 쫓아다닌 차이는 없었다. 대신 조각을 하나씩 빼서 무엇이 어느 픽셀을 맞추는지 확인했다.
- **테마**: `base16/monokai.css`를 `styles/monokai.css`로 바꾸면 `3/39`. 크기는 같고 색만 달라서 차이가 0.02–0.66%다. 허용 오차가 0이 아니면 지나갈 차이다.
- **글꼴**: `@font-face`를 빼면 `3/39`(크기는 같고 0.05–0.83%, 대체 글꼴의 글자 모양). 그런데 예전 소스처럼 Google Fonts `<link>`로 걸어도 **`39/39`** 였다. 오늘 Google이 주는 파일은 v32 woff2인데 이 머신에서는 픽셀이 같다. 그래도 인라인을 택했다: 배포본이 실제로 받는 파일이고, 렌더를 막는 요청이 하나 적고, Google이 내일 무엇을 주든 결과가 같다. (이 실험은 공유 캐시 `.verify/cache`에 새 응답이 남지 않게 캐시 사본으로 돌렸다.)
- **받는 자원**: 일회용 스크립트로 14개 라우트가 배포본과 같은 서드파티 URL을 요청하는 것을 확인했다. 글 10개는 글꼴 전체(56KB, `unicode-range`가 없는 첫 규칙)까지 받고, 2개는 latin 조각만 받는다. 코드 블록에 한글이 있으면 어느 조각에도 없는 글자라 전체 파일을 받아 보는 것이다. 배포본과 같은 낭비이고 S4.2에서 정리한다.
- **KaTeX 버전**: 새 KaTeX가 반올림한 `em` 값 93곳의 computed `margin-right`가 `0.971291px → 0.971872px`처럼 다르다. 0.001px보다 작아 Chromium의 배치 단위(1/64px)에서 사라지고 요소 상자는 전부 같다. `katex`를 고정할 근거가 없어 의존성은 건드리지 않았다.
- **화면 비교가 못 보는 것**: `.prose a:hover`와 `.prose details > summary` 규칙을 지워도 `visual 39/39`다. 일회용 스크립트로 13개 라우트 × 3개 뷰포트에서 레이아웃 안 모든 요소의 computed style 전체와 상자, 링크·`summary`의 hover 상태, `<details>`를 다 연 스크린샷을 비교했다. 남은 차이는 styled-components가 붙이던 `-webkit-box-*`, 위의 KaTeX 값, 두 테스트 서버의 포트가 달라 생긴 `background-image` URL뿐이다. 같은 스크립트가 두 규칙을 지운 빌드에서는 차이를 잡는다. hover 부분은 나중에 `hover` 검사(V3)가 됐다. 지금 두 규칙을 지우면 `visual 78/78`인 채로 `FAIL hover 3/13`이다.
- **`/404`**: 1280과 375 너비로 찍어 봤다. 머리, 문구, 밑줄 친 홈 링크, 바닥의 푸터가 한 화면에 들어오고 가로 스크롤이 없다. 고칠 것이 없었다.

## 직접 해볼 실험

끝나면 매번 `git checkout src`로 되돌린다.

1. `HeadAssets.astro`의 `<style is:inline>`을 `<style>`로 바꾸고 `npm run build`, `ls -l dist/_astro`, `grep -c '<style' dist/index.html`.
   <details><summary>예상 결과</summary>`BaseLayout.<해시>.css`(5,578바이트)가 생기고 모든 페이지가 `<link rel="stylesheet" href="/_astro/BaseLayout.<해시>.css">`로 건다. grep은 1. `@font-face`가 "모든 페이지가 쓰는 묶음"에 합쳐져(3,185 + 줄어든 2,393) 4,096바이트를 넘었기 때문이다. 남은 인라인 `<style>`은 홈 666, 404 107, 글 2,763바이트이고 `npm run -s verify -- --only=visual --no-check`는 78/78 그대로다.</details>
2. `[id].astro`에서 `import "highlight.js/styles/base16/monokai.css";` 한 줄만 펜스 맨 위로 옮기고 빌드한 뒤 위의 "순서" grep을 다시 돌린다.
   <details><summary>예상 결과</summary>`pre code.hljs .prose{ [hidden]`. 옮기지 않은 prose까지 `global.css` 앞으로 갔다. 둘은 한 묶음이고 묶음은 가장 이른 import의 자리에 놓인다. 지금은 특이도가 같으면서 같은 속성을 다투는 규칙이 없어서 `visual 78/78`이다.</details>
3. `HeadAssets.astro`에서 KaTeX `<link … />`를 지우고 `npm run -s verify -- --only=visual --no-check`.
   <details><summary>예상 결과</summary>`FAIL visual 72/78`. `/posts/how-to-check-two-types-are-equal-in-ts`의 여섯 뷰포트만 실패한다. 375는 `height 4722 ≠ 4850 (+128)`, 768과 1280은 `height 3456 ≠ 3516 (+60)`이고 그 사이 너비도 페이지가 길어진다. KaTeX는 수식마다 MathML과 HTML을 함께 내보내고 스타일시트가 MathML 쪽을 숨긴다. 스타일시트가 없으면 수식이 `𝐴A`처럼 두 번 보인다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/styling/ (External Styles: 로컬·npm 패키지 스타일시트 import, `<link>`는 처리하지 않음 / Cascading Order / Markdown Styling / Bundle control)
- https://docs.astro.build/en/reference/directives-reference/ (`is:inline`)
- https://docs.astro.build/en/reference/configuration-reference/ (`build.inlineStylesheets`)
- 계획과 달리 한 것: monokai는 `HeadAssets`가 아니라 글 페이지가 import 한다(배포본도 글 페이지에만 실었다).
- 문서에 없어 직접 확인한 것: 4kB 기준이 페이지가 아니라 묶음 단위이고 인라인된 묶음이 `<style>` 하나로 합쳐지는 것, 묶음이 나뉘는 기준과 놓이는 순서(`node_modules/astro/dist/core/build/plugins/plugin-css.js`, `runtime.js`의 `cssOrder`·`mergeInlineCss`).
