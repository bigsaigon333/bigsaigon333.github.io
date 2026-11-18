# 34. 섹션 링크: 사용자 hast 플러그인과 heading-ids 의 순서

## 한 줄 요약

본문의 h2–h4 를 누르면 그 섹션 주소(`#id`)로 간다. `config/hast-heading-links.mjs`가 제목 내용을 `<a class="heading-link" href="#id">`로 감싼다. 사용자 hast 플러그인은 Sätteri 의 heading-ids 보다 **먼저** 돈다. 그래서 id 를 heading-ids 와 똑같이 직접 계산해 href 와 함께 넣는다. `#` 표시는 CSS `::after`로만 그려 제목 글자가 바뀌지 않는다. 새 feature 검사 `anchors`가 링크, 해시, 스크롤, 클라이언트 라우팅을 확인한다.

## 개념

- **플러그인 순서**: `createSatteriMarkdownProcessor`가 hast 플러그인을 `하이라이트 → 사용자 hastPlugins → image-marker → heading-ids` 순서로 쌓는다(`satteri-processor.js`). heading-ids 는 제목에 이미 문자열 id 가 있으면 그 값을 쓰고, slugger 에 넣지 않는다.
- **slug 를 똑같이**: heading-ids 는 문서마다 `new Slugger()` 하나로 h1–h6 **모두**를 센다. 그래서 플러그인을 팩토리(`hastPlugins: [headingLinksPlugin]`)로 두어 Sätteri 가 문서마다 부르게 하고, h1–h6 모두에 id 를 넣는다. h2–h4 에만 넣으면 heading-ids 의 새 slugger 가 그 slug 를 모른 채 h5 를 세어 `-1` 접미사가 어긋날 수 있다. 글자는 `ctx.textContent(node)`다. KaTeX 는 raw 노드라 빠진다(`### 임의의 집합 $C$` → `임의의-집합-`).
- **감싸기**: `ctx.setField(node, "children", [a])`로 기존 자식을 새 `<a>` 안에 옮긴다. 제목에 이미 링크가 있으면(링크 안에 링크는 HTML 파서가 끊는다) 감싸지 않고 `aria-label`이 있는 빈 링크를 앞에 둔다.
- **표시**: `content: "#" / ""`는 대체 텍스트가 빈 생성 콘텐츠라 접근 이름에도 들어가지 않는다. 평소 `opacity: 0`, `:hover`·`:focus-visible`에서 1, `@media (hover: none)`(터치)에서는 늘 1이다. `scroll-margin-top: 1.5rem`이 해시로 스크롤한 제목을 화면 끝에서 띄운다.

## Next.js 대응

| Next.js (MDX)                              | Astro 7 + Sätteri                                          |
| ------------------------------------------ | ---------------------------------------------------------- |
| `rehype-slug` + `rehype-autolink-headings` | 내장 heading-ids + 직접 쓴 hast 플러그인(id 를 먼저 계산)  |
| unified 플러그인(`(tree) => visit(...)`)   | Sätteri 방문자 `{ element: { filter, visit(node, ctx) } }` |
| `next/link`의 해시 이동                    | `<ClientRouter />`가 같은 페이지 해시 클릭을 처리          |

## 빌드 결과물에서 확인하기

- `dist/posts/css-masters-2-week1.html`: `<h3 id="참고-1"><a class="heading-link" href="#참고-1">참고</a></h3>`. 한글 그대로이고, 두 번째 "참고"는 `-1`이다.
- 목차 링크 href 와 제목 id 가 같다(목차는 heading-ids 가 모은 `headings`의 slug 를 쓴다). `toc` 검사가 글자까지 그대로 통과한다.
- `dist/_astro/_id_.*.css`에 `.prose .heading-link:after{content:"#" / "";…opacity:0…}`와 `@media (hover:none)` 규칙이 있다.

## 닫힌 고리가 잡아낸 것

- 처음 단위 시험은 "이 플러그인을 뺀 같은 설정"과 id·headings 를 비교했다. 한글, 중복, 수식, h1·h5·h6 가 섞인 문서에서 같았다.
- 터치 확인을 CDP `Emulation.setEmulatedMedia`의 `hover: none`으로 하려 했지만 `matchMedia("(hover: none)")`가 false 였다. 이 기능은 `hover`를 흉내 내지 않는다. `hasTouch: true` 컨텍스트에서는 true 라서 그쪽으로 바꿨다.
- 자기 검사 "중복 제목(-1)" 변이가 처음에는 잡히지 않았다. `routes(dir)`는 `apply` **뒤에** 불리는데, 변이가 고친 href 로 페이지를 찾아서 다른 글을 검사했다. 변이가 건드리지 않는 id 로 찾게 고쳤다.
- parity 검사(content, hover, routes, visual)는 의도한 차이로 실패했다. `accepted/h1-heading-links.json`에 검사마다 사유를 적었다.

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `config/hast-heading-links.mjs`의 filter 를 `["h2", "h3", "h4"]`로 줄이고 `npm test -- config`.
   <details><summary>예상 결과</summary>첫 시험이 실패한다. h1·h5·h6 의 slug 를 heading-ids 의 새 slugger 가 따로 세어, 플러그인 없이 렌더한 쪽과 `소개-2`·`소개-3` 같은 id 가 어긋난다.</details>
2. `src/styles/prose.css`의 `@media (hover: none)` 블록을 지우고 `npm run build`, `npm run verify -- --no-build --no-check --only=anchors`.
   <details><summary>예상 결과</summary>`FAIL anchors`. 글마다 `section link mark hidden at rest with "hover: none" (touch)`가 나온다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/markdown-content/#heading-ids (heading id 와 플러그인 순서)
- https://github.com/Flet/github-slugger (slug 규칙, 인스턴스마다 중복을 센다)
- https://developer.mozilla.org/en-US/docs/Web/CSS/content#alternative_text_string_counter (생성 콘텐츠의 대체 텍스트)
- https://developer.mozilla.org/en-US/docs/Web/CSS/scroll-margin-top
