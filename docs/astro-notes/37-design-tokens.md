# 37. 디자인 토큰과 공용 목록 컴포넌트

## 한 줄 요약

색·간격·글자 크기·둥근 모서리를 `src/styles/tokens.css` 한 곳에 CSS 사용자 정의 속성으로 모으고, 나머지 CSS는 `var(--…)`만 쓴다(색 값은 이 파일에만 있다). 브레이크포인트는 모바일 먼저 `min-width` 둘(`40rem`, `64rem`)로 줄였다. 홈·태그·카테고리 목록은 `PostList`·`PostListItem`(제목, 날짜, 카테고리, 요약) 하나로 그리고, 태그 알약과 카테고리 링크는 `TagPill`·`CategoryLink`로 묶었다. 헤더는 "김동희입니다"와 소개 한 줄, 그 아래 카테고리·태그 탐색 줄이고, 푸터에는 RSS와 GitHub 링크가 있다.

## 개념

- **토큰 파일을 따로 두되 파일은 늘리지 않는다**: `global.css`가 `@import "./tokens.css"`를 한다. Vite는 로컬 `@import`를 그 자리에 펼치므로 결과는 `BaseLayout.<hash>.css` 하나다. `<link rel="stylesheet">`가 늘면 렌더 차단 요청도 는다.
- **다크 모드는 토큰만 바꾼다**: `:root[data-theme="dark"]`가 같은 이름의 값만 다시 정한다. 컴포넌트는 테마를 모른다. `CopyCode`는 `#fff`·`#595959`를 직접 써서 다크에서도 흰 버튼이었는데, `var(--color-bg)`·`var(--color-muted)`로 바꾸자 저절로 고쳐졌다.
- **`@custom-media`는 문서로만**: 브라우저가 아직 모르는 문법이라 `tokens.css` 주석에 `--bp-md (min-width: 40rem)`, `--bp-lg (min-width: 64rem)`을 적고 `@media`에는 값을 그대로 쓴다.
- **scoped 스타일과 CSS 청크**: Astro는 컴포넌트의 `<style>`을 그 컴포넌트를 쓰는 페이지 묶음마다 다른 CSS 청크로 나눈다. 글·목록 양쪽이 쓰는 `TagPill`·`CategoryLink`를 scoped로 두면 청크가 하나 더 생긴다. 그래서 둘의 모양은 `global.css`의 `.tag-pill`·`.category-link`로 두었다. 목록에서만 쓰는 `PostList`는 scoped다(홈·태그·카테고리 페이지가 한 청크를 나눠 쓴다).
- **한글 본문**: `word-break: keep-all`로 단어 중간에서 줄이 바뀌지 않게 하고, 행간 1.75, 한 줄 최대 `40em`(한글 약 40자)으로 둔다. 제목은 위를 넓게(2.2em), 아래를 좁게(0.6em) 띄워 뒤 문단에 붙어 보이게 한다.
- **본문 링크**: 강조색에 늘 밑줄이다. 색만으로 링크를 구분하지 않는다(WCAG 1.4.1).

## Next.js 대응

| Next.js                                           | Astro (이 저장소)                                          |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `app/globals.css` + CSS 변수, 또는 Tailwind theme | `src/styles/tokens.css`(`global.css`가 `@import`)          |
| CSS Modules(`*.module.css`)                       | 컴포넌트 `<style>`(`data-astro-cid-*`로 스코프)            |
| 공용 `<PostCard>` 컴포넌트                        | `PostList.astro` + `PostListItem.astro`                    |
| `next-themes`의 `class`/`data-theme`              | `<head>` 인라인 스크립트의 `data-theme` + 토큰 다시 정하기 |

## 빌드 결과물에서 확인하기

- `dist/_astro/BaseLayout.*.css` 앞부분에 `:root{color-scheme:light;--color-bg:#fff;…}`와 `:root[data-theme=dark]{…}`가 있다.
- 홈은 스타일시트 2개(`BaseLayout`, `PostList`), 글은 2개(`_id_`, `BaseLayout`)다. 예전에는 셋이었다.
- `dist/index.html`: `<nav aria-label="카테고리로 보기">`에 `/categories/<slug>` 알약, `<section class="post-list">` 아래에 `<article class="post-item">`이 글마다 이어진다. 요약은 `postDescription`과 같은 글자다.

## 닫힌 고리가 잡아낸 것

- 자기 검사의 변이 중 parity 검사(`visual`, `hover`)의 것은 **기준선**을 고친다. 릴리스 전까지 기준선은 예전 사이트라, 정규식을 새 CSS로 바꾸면 지금 변이가 "적용되지 않음"으로 실패한다. 그래서 예전 규칙과 새 규칙을 둘 다 잡는 대안 정규식으로 썼다.
- 이 커밋을 기준선으로 두고 자기 검사를 돌리자 "글 본문 링크의 hover 효과 제거" 변이를 `hover` 검사가 놓쳤다. 새 hover 는 밑줄 두께(`text-decoration-thickness`)만 바꾸는데, 검사가 읽는 속성 목록에 그것이 없었다. 목록에 더해 검사를 넓혔다.
- 화면 너비 768은 새 경계(640, 1024) 어디에도 붙지 않는다. 1024로 바꿔 `64rem` 경계를 옮기는 변이가 거기서만 보이게 했다. 600·700은 예전 경계와 새 `40rem` 경계 양쪽에 쓰인다.
- `categories`·`tags`·`drafts` 변이는 `<section>` 바로 아래의 `<article>`을 지우고 순서를 바꾼다. 그래서 목록 항목은 `<li>`가 아니라 `<article>`이다.

## 직접 해볼 실험

1. `tokens.css`의 다크 `--color-muted`를 `#3d444d`로 바꾸고 `npm run verify -- --feature --only=theme`.
   <details><summary>예상 결과</summary>FAIL. 다크 모드의 `color-contrast` 위반이 날짜·요약·읽는 시간 줄에서 잡힌다. 토큰 하나가 여러 컴포넌트에 퍼져 있다는 것을 보여 준다.</details>
2. `CategoryLink.astro`에 `<style>.category-link{color:red}</style>`를 더하고 `npm run build` 뒤 `grep -o '<link rel="stylesheet"[^>]*>' dist/posts/regular-expression-1.html`.
   <details><summary>예상 결과</summary>스타일시트가 하나 늘 수 있다. 글과 목록이 함께 쓰는 컴포넌트의 scoped 스타일은 그 묶음만의 청크가 된다. `perf` 검사의 렌더 차단 수 한도(3)에 닿는 원인이다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/styling/ (scoped 스타일, 전역 스타일, CSS 번들)
- https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties
- https://drafts.csswg.org/mediaqueries-5/#custom-mq (`@custom-media`)
- https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html
