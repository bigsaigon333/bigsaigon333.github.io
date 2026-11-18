# 39. 인라인 댓글 클라이언트: 로더 커스텀 엘리먼트, 지연 UI 조각, Custom Highlight

## 한 줄 요약

utterances 를 지우고 `comments/` 워커를 부르는 클라이언트를 붙였다. 글 페이지에는 빈 `<post-comments data-api data-post hidden>`과 작은 로더만 정적으로 실린다. 로더는 idle 때 thread 목록을 받고(4초 제한), 실패하면 숨긴 채로 둔다. UI 조각(`ui.ts`, 11.5KB)은 thread 가 있을 때, 본문을 선택했을 때, 댓글 자리가 화면 가까이 올 때만 동적 import 한다. 하이라이트는 CSS Custom Highlight API(`comments`)로 그려 본문 DOM 을 건드리지 않는다. 문장 위치 찾기는 순수 함수 `src/lib/anchor.ts`에 두고 단위 시험을 붙였다.

## 개념

- **본문 텍스트 = 텍스트 노드를 이은 것**: `selection.toString()`은 CSS 에 따라 줄바꿈이 달라진다. 그래서 `<main>` 아래 텍스트 노드의 `data`를 구분자 없이 이은 문자열을 기준으로 삼는다. 수식(`<math>`와 `aria-hidden` 사본), 복사 버튼, `script`·`style`은 뺀다. 저장하는 값은 W3C TextQuote(`exact`, 앞뒤 32자)와 TextPosition(`start`, `end`)이다.
- **다시 찾기**: 저장한 위치의 글자와 문맥이 그대로면 그 자리를 쓴다. 아니면 `exact`가 나오는 모든 자리에서 앞뒤 문맥이 가장 많이 맞는 곳을 고른다. 점수가 같으면 원래 위치에 가까운 곳이다. 아무 데도 없으면 "원문을 찾을 수 없는 댓글" 목록에 넣는다.
- **경계점 → 위치**: Range 의 (노드, offset)이 요소 사이나 뺀 노드 안을 가리킬 수 있다. 그래서 뿌리 아래 모든 노드에 전위 순회 번호를 매긴다. start 는 그 뒤의 첫 글자, end 는 그 앞의 마지막 글자 뒤로 붙인다. DOM API 를 쓰지 않으니 가짜 노드로 시험할 수 있다.
- **Custom Highlight**: `CSS.highlights.set("comments", new Highlight(...ranges))`와 `::highlight(comments)`만 쓴다. `<mark>`를 끼우지 않으므로 정적 HTML 과 `content` 검사가 바뀌지 않는다. 하이라이트는 이벤트를 받지 못한다. 그래서 클릭 지점을 `caretPositionFromPoint`로 바꾸고 `range.isPointInRange`로 어느 thread 인지 찾는다.
- **CSP**: 스크립트가 `<style>`을 넣으면 해시가 없어 막힌다. 그래서 스타일은 `Comments.astro`의 전역 `<style>`(번들 CSS 파일)에 둔다. 위치는 CSSOM(`el.style.top`)으로 준다. 정책은 `connect-src`에 워커 출처 하나만 더한다. `frame-src`와 utterances 의 스크립트·스타일 해시는 지웠다.
- **정리**: 클라이언트 라우팅으로 글을 떠나면 `disconnectedCallback`과 `astro:before-swap`이 AbortController 를 끊는다. 그러면 리스너, `CSS.highlights`, 선택 버튼, 패널이 함께 사라진다.
- **로그인**: 먼저 팝업으로 연다. `message`의 `event.origin`이 API 출처이고 `type`이 `comments:auth`일 때만 토큰을 받는다. 팝업이 막히면 전체 이동한 뒤 돌아온 `#comments-token=…`을 로더가 읽고 `history.replaceState`로 지운다.

## Next.js 대응

| Next.js                                        | 이 사이트                                                     |
| ---------------------------------------------- | ------------------------------------------------------------- |
| `next/dynamic(() => import(...), {ssr:false})` | 로더의 `import("./ui")` (조건이 맞을 때만)                    |
| `useEffect` 정리 함수                          | `disconnectedCallback` + AbortController                      |
| `NEXT_PUBLIC_*` 환경 변수                      | `PUBLIC_COMMENTS_API`(config/.env.\*) → `config/comments.mjs` |
| `next.config.js` 의 `headers()` CSP            | `config/csp.mjs`의 `<meta>` 정책(connect-src 에 워커 출처)    |

## 빌드 결과물에서 확인하기

- `dist/posts/<id>.html`: `<post-comments data-api="https://comments.example.workers.dev" data-post="<id>" hidden>`. utterances 스크립트는 없다.
- `dist/_astro/Comments.astro_…js`(3.6KB)는 로더다. 그 안의 ``import(`./ui.….js`)``가 지연 조각(11.5KB)을 가리킨다.
- 빌드 로그 `[site-guard] … 페이지당 JS ≤ 32768바이트, 지연 JS ≤ 16384바이트`. 글 페이지의 정적 JS 는 23197바이트다.
- CSP `<meta>`의 `connect-src` 끝에 워커 출처가 있다. `frame-src`는 없다.

## 닫힌 고리가 잡아낸 것

- 로더가 예상(1.5KB)의 두 배였다. Vite 가 동적 import 를 `__vitePreload`(약 1.7KB)로 감싼다. `build.modulePreload: false`를 통합에서 넣어 봤지만 크기가 그대로였다. Astro 가 `modulePreload: { polyfill: false }`로 덮어쓰고, Vite 8 은 client 환경이면 늘 도우미를 넣는다(`getInsertPreload`). 그래서 받아들이고, 정적 예산 안임을 site-guard 로 확인했다.
- site-guard 의 import 정규식은 따옴표만 보았다. 압축된 출력은 ``import(`./ui.js`)``처럼 백틱을 쓴다. 정적 import 와 동적 import 를 나누어 백틱도 받게 했다. `lazyBudget`을 11000으로 낮추면 글 12쪽이 `지연 JS 11490바이트 > 예산`으로 실패한다.
- 스모크에서 `page.goto`로 같은 글에 `#comments-token=`만 붙이면 같은 문서 안의 이동이라 로더가 다시 돌지 않았다. 실제 흐름은 워커에서 돌아오는 전체 이동이다. 그래서 시험도 `about:blank`을 거친다.
- 새로 고친 뒤 스크롤 위치가 복원되어, 하이라이트 좌표가 화면 밖으로 나가 클릭이 빗나갔다. 클릭 전에 하이라이트를 화면 안으로 스크롤한다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `src/lib/anchor.ts`의 `SKIP_TAGS`에서 `"math"`를 빼고 `npx vitest run src/lib/anchor.test.ts`.
   <details><summary>예상 결과</summary>"MathML, aria-hidden … 의 글자는 뺀다" 시험이 실패한다. 본문 텍스트에 `x+1`이 끼어들어 위치가 밀린다. 수식이 있는 글에서는 저장한 위치가 바뀐다.</details>
2. `config/integrations.mjs`의 `lazyBudget`을 `8 * 1024`로 바꾸고 `npm run build`.
   <details><summary>예상 결과</summary>site-guard 가 글 페이지마다 `지연 JS 예산 초과 … (_astro/ui.….js)`를 적고 빌드가 실패한다. 홈처럼 댓글이 없는 페이지는 지연 JS 가 0이라 통과한다.</details>

## 문서 근거

- https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API
- https://www.w3.org/TR/annotation-model/#text-quote-selector
- https://developer.mozilla.org/en-US/docs/Web/API/Document/caretPositionFromPoint
- https://vite.dev/config/build-options#build-modulepreload
- https://docs.astro.build/en/guides/client-side-scripts/#web-components-with-custom-elements
