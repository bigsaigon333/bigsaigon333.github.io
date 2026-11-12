# 22. 스크립트 패턴: 처리되는 `<script>`와 커스텀 엘리먼트

## 한 줄 요약

코드 블록의 "복사" 버튼(`src/components/CopyCode.astro`의 `<copy-code>`)과 목차 스크롤 스파이(`src/components/Toc.astro`의 `<toc-spy>`)를 **처리되는** `<script>` 안의 커스텀 엘리먼트로 만들었다. 둘 다 빌드에서 압축된 `<script type="module">`로 글 페이지에 인라인되고(글마다 +1291바이트), 새 browser feature 검사 `interactions`가 클립보드와 `aria-current`를 Playwright로 확인한다.

## 개념

- **처리되는 스크립트 vs `is:inline`.** 속성 없는 `<script>`는 Astro가 TypeScript를 검사·번들·압축하고 `type="module"`을 붙인다(07 노트). 작으면 파일로 빼지 않고 쓴 자리에 인라인한다. 같은 컴포넌트를 여러 번 써도 한 번만 실린다. GA·utterances처럼 "쓴 그대로" 나가야 하는 것만 `is:inline`이다.
- **모듈은 한 번만 실행된다.** 그래서 스크립트 본문은 클래스를 정의하고 `customElements.define`만 한다(이미 있으면 건너뛴다). **맨 위에서 DOM을 찾지 않는다.** 일은 `connectedCallback`이 한다. 엘리먼트가 문서에 붙을 때마다 브라우저가 부르므로, 나중에 View Transitions(S6.2)가 새 페이지의 `<copy-code>`·`<toc-spy>`를 바꿔 넣어도 다시 돈다. `disconnectedCallback`이 `IntersectionObserver`를 끊는다.
- **빈 호스트 엘리먼트.** 코드 블록은 `<Content />`가 그린 Markdown이라 컴포넌트가 감쌀 수 없다. `<copy-code hidden>` 하나를 `<main>` 앞에 두고, 그 `connectedCallback`이 `pre.astro-code`마다 `<button type="button">`을 `<pre>` 안에 붙인다. `hidden`이라 `.layout`의 `row-gap`에 끼지 않는다. `<main>` 뒤에 두면 utterances 스크립트의 앞 요소(`main`)가 바뀌어 `embeds`가 실패한다.
- **런타임 요소의 스타일.** 스크립트가 만든 버튼에는 `data-astro-cid-*`가 없어 scoped `<style>`이 닿지 않는다. `<style is:global>`로 썼다. 이 컴포넌트는 글 페이지만 쓰므로 홈·404에는 실리지 않는다.
- **복사.** `navigator.clipboard.writeText(<code>의 textContent)`. 성공하면 "복사됨", 실패(권한 거부, 비보안 출처)하면 "복사하지 못했습니다", 2초 뒤 "복사". 진짜 `<button>`이라 Tab·Enter·Space가 그냥 된다. 접근 가능한 이름은 글자 그대로이고 `aria-live="polite"`로 바뀐 이름을 읽어 준다.
- **스크롤 스파이.** "지금 읽는 제목" = 위가 화면 위쪽 30% 선보다 위인 마지막 제목. `rootMargin: "0px 0px -70% 0px"`로 관찰 영역을 그 선까지 줄여, 제목이 선을 넘을 때만 콜백이 돈다. 콜백은 모든 제목의 위치로 다시 계산하므로 멀리 건너뛴 스크롤도 맞다. 그 링크에만 `aria-current="true"`.

## Next.js 대응

| 예전 (배포본)                            | 지금 (S6.3)                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| 코드 복사 없음                           | `<copy-code>`: `connectedCallback`에서 버튼 생성, 처리되는 `<script>`              |
| 목차 없음(S5.3에서 정적 목차)            | `<toc-spy>`가 `<nav aria-label="목차">`를 감싸고 `IntersectionObserver`            |
| React라면 `useEffect` + `ref` + 정리함수 | `connectedCallback` / `disconnectedCallback`. 프레임워크 런타임 없이 브라우저 표준 |
| 글 페이지 JS 213바이트(GA 인라인)        | 1504바이트(+621 스크롤 스파이, +670 복사). `accepted/s6-3-scripts.json`의 `budget` |

## 빌드 결과물에서 확인하기

- `dist/posts/proxy-to-built-in-objects.html`: `</div><script type="module">var e=.3,t=class extends HTMLElement{#e;connectedCallback(){…`(목차 뒤) 그리고 `<copy-code hidden="true"></copy-code><script type="module">var e=\`복사\`,…customElements.define(\`copy-code\`,t);</script><main`. `dist/_astro/*.js`는 없다(둘 다 인라인).
- `grep -c 'customElements.define' dist/index.html dist/404.html` → 0.
- `npm run -s verify -- --no-check --only=interactions` → `PASS interactions 12/12`. `budget`은 글 12개가 `ACCEPT`.
- `a11y`(axe)는 그대로 통과: 버튼 글자 `#595959`/흰 배경 7:1.

## 닫힌 고리가 잡아낸 것

- **클립보드는 페이지가 아니라 브라우저의 것.** 처음 검사는 다른 browser 검사처럼 페이지 4개를 동시에 돌렸고, 5개 글이 `clipboard "" ≠ block …` 또는 다른 글의 코드로 실패했다. 한 번에 한 페이지로 바꾸자 12/12.
- **닫힌 `<details>` 안의 코드 블록.** `regular-expression-1`이 `4 buttons named "복사" for 5 code blocks`. 버튼은 있지만 접힌 `<details>`("검증 코드") 안이라 접근성 트리에서 빠진다. 검사가 `main details`를 연 뒤에 본다.
- `budget`이 글마다 `JS 213 → 1504 bytes (+1291)`로 실패했다. 의도한 증가라 정확한 바이트를 사유에 적어 허용했다.
- 맨 위에서 `document.querySelectorAll`을 하지 않는 이유는 지금의 게이트로는 드러나지 않는다(모듈은 페이지마다 한 번 돌고 그때 DOM이 다 있다). S6.2의 클라이언트 라우팅에서는 모듈이 다시 실행되지 않아 지난 페이지의 목록을 붙잡게 된다.

## 직접 해볼 실험

끝나면 `git checkout src/components`로 되돌린다.

1. `CopyCode.astro`의 `<script>`를 `<script is:inline>`으로 바꾸고 `npm run build`, 이어서 `npm run -s verify -- --no-check --no-build --only=interactions --route=/posts/proxy-to-built-in-objects`.
   <details><summary>예상 결과</summary>`<copy-code hidden="true"></copy-code><script>` 뒤에 압축되지 않은 원문(1170바이트, 처리되면 670)이 나가고 `FAIL interactions 0/1 … 0 buttons named "복사" for 5 code blocks`. 클래식 스크립트는 파싱 도중 바로 실행되어, `define`이 `<copy-code>`를 곧바로 업그레이드하고 `connectedCallback`이 아직 파싱되지 않은 `<main>`에서 `pre`를 찾는다. 모듈은 파싱이 끝난 뒤 실행된다.</details>
2. `Toc.astro`의 `link.setAttribute("aria-current", "true")`를 `"location"`으로 바꾸고 `npm run build` 뒤 1과 같은 검사.
   <details><summary>예상 결과</summary>`heading #… at the top: aria-current on [], expected [#…]`. 검사는 값이 정확히 `"true"`인 링크 하나를 찾는다(자기 검사의 변이 "스크롤 스파이가 aria-current 대신 다른 속성을 단다"와 같은 실패).</details>

## 문서 근거

- https://docs.astro.build/en/guides/client-side-scripts/ (처리되는 스크립트, 커스텀 엘리먼트 예시 `astro-heart`)
- https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements (`connectedCallback`, `disconnectedCallback`)
- https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API (`rootMargin`)
- https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
- https://playwright.dev/docs/api/class-browsercontext#browser-context-grant-permissions (`clipboard-read`·`clipboard-write`)
