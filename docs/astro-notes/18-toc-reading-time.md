# 18. 목차와 읽는 시간: render()의 headings

## 한 줄 요약

`render(post)`가 돌려주는 `headings`(`{ depth, slug, text }[]`)에서 h2·h3만 골라 `src/components/Toc.astro`가 접힌 `<nav aria-label="목차"><details>` 목차를 그리고, `src/lib/reading-time.ts`가 원문 글자 수로 "읽는 시간 약 N분"을 계산한다. 새 feature 검사 `toc`가 목차 = 본문 h2/h3(순서·id·글자)과 앵커 대상이 정확히 하나인지를 본다.

## 개념

- **`headings`는 `render()`의 결과다.** `const { Content, headings } = await render(post)`. `slug`는 Astro가 본문 제목에 붙인 `id`와 같아서 `href={"#" + slug}`가 그대로 앵커가 된다(github-slugger, 같은 글자면 `-1`, `-2`가 붙는다: `참고`, `참고-1`).
- **h1~h6이 다 들어 있다.** 깊이로 거른다. GFM 각주의 `<h2 id="footnote-label">Footnotes</h2>`도 들어 있다. 본문에 실제로 있는 h2이므로 목차에도 둔다.
- **수식은 `text`에서 빠진다.** KaTeX 플러그인(`config/markdown.mjs`)이 `$C$`를 `html` 노드로 바꾸므로 `### 임의의 집합 $C$`의 `text`는 `"임의의 집합 "`이다. Toc가 원문에서 수식이 든 h2·h3 줄을 찾아 수식을 뺀 글자가 같으면 그 조각을 KaTeX로 다시 그린다.
- **컴포넌트에서도 `Astro.params`를 읽는다.** 페이지(`[id].astro`)가 `headings`만 넘겨도 Toc는 `getEntry("posts", Astro.params.id)`로 원문(`post.body`)을 얻는다.
- **읽는 시간 규칙**(`reading-time.ts` 머리 주석): 펜스 코드 블록·HTML 태그·링크 주소·Markdown 기호를 지우고 공백 아닌 글자를 센 뒤 `round(글자 / 500)`, 최소 1분. 한국어는 단어 수가 아닌 글자로 센다. 레시피의 `reading-time` 패키지(영어 단어 기준 200wpm)는 쓰지 않았다.
- **목차는 h2/h3이 2개 이상일 때만** 그린다. 읽는 시간은 늘 그린다. 색 `#595959`는 흰 배경 대비 7:1.

## Next.js 대응

| 예전 (배포본)                | 지금 (S5.3)                                                      |
| ---------------------------- | ---------------------------------------------------------------- |
| 목차 없음                    | `Toc.astro`: `headings` → `<nav aria-label="목차"><details><ol>` |
| 읽는 시간 없음               | `lib/reading-time.ts`의 `readingMinutes(post.body)`              |
| 제목 id는 목차에 쓰이지 않음 | Astro가 h1~h6에 붙인 github-slugger id가 목차 링크의 대상이다    |
| (레시피: remark 플러그인)    | 플러그인 대신 컴포넌트에서 계산(설정·페이지를 건드리지 않는다)   |

## 빌드 결과물에서 확인하기

- `dist/posts/proxy-to-built-in-objects.html`: `<p class="reading-time">읽는 시간 약 2분</p><nav class="toc" aria-label="목차"><details><summary>목차</summary><ol><li><a href="#i-문제상황">I. 문제상황</a>…`.
- `dist/posts/how-to-check-two-types-are-equal-in-ts.html`: 목차의 `#임의의-집합-` 링크 안에 본문과 같은 `<span class="katex">`가 있다.
- `npm run verify -- --feature --only=toc` → `PASS toc 12/12`.
- `hover`는 `accepted/s5-3-toc.json`의 `mask: [".post-extra"]`로 새 상자만 빼고 통과, `visual`은 페이지가 82px 길어져 글 라우트를 허용했다. `content`·`a11y`는 그대로 통과(목차는 `<main>` 밖이다).

## 닫힌 고리가 잡아낸 것

- **Red**: 첫 구현은 `heading.text`를 그대로 썼다. `toc` 검사가 `toc entry 3 text "임의의 집합" ≠ "임의의 집합 ⟦tex:C⟧"`로 실패했다. 검사가 양쪽 수식을 TeX 토큰으로 바꿔 비교하기 때문이다. 원문에서 수식을 되살리자 12/12.
- **hover**: 목차의 `<summary>`가 기준선에 없어 "13 visible a[href]/summary elements, candidate has 14"로 실패했다. 라우트 통째 허용 대신 mask로 상자만 가렸다.
- **visual**: 모든 글에서 높이 +82px. 접힌 목차여도 한 줄과 row-gap(2rem)이 더해진다. 그 아래가 밀리므로 mask가 아닌 허용이 필요했다.

## 직접 해볼 실험

끝나면 `git checkout src/components/Toc.astro`로 되돌린다.

1. `Toc.astro`의 `itemOf`가 늘 `[{ text: heading.text }]`를 돌려주게 하고 `npm run -s verify -- --feature --only=toc`.
   <details><summary>예상 결과</summary>`FAIL toc 11/12`, `/posts/how-to-check-two-types-are-equal-in-ts`에서 수식이 빠진 글자를 알린다.</details>
2. `heading.depth !== 2 && heading.depth !== 3` 조건을 지워 h4까지 넣고 같은 명령.
   <details><summary>예상 결과</summary>h4가 있는 글(`js-the-new-toys-study-01` 등)이 `toc entry N … ≠ …`로 실패한다. 검사는 본문 h2/h3만 목차로 친다.</details>
3. `src/lib/reading-time.ts`의 `CHARS_PER_MINUTE`를 250으로.
   <details><summary>예상 결과</summary>분이 대략 두 배가 된다(`regular-expression-1`이 12분 → 24분 안팎). `toc`는 숫자 모양만 보므로 통과한다.</details>

## 문서 근거

- https://docs.astro.build/en/reference/modules/astro-content/#render (`headings`, `remarkPluginFrontmatter`)
- https://docs.astro.build/en/guides/markdown-content/#heading-ids (github-slugger id, 플러그인 순서)
- https://docs.astro.build/en/recipes/reading-time/ (Sätteri mdast 플러그인으로 `minutesRead`. 이 단계는 쓰지 않았다)
- 문서에 없어 빌드로 확인한 것: 각주 라벨 h2가 `headings`에 들어간다는 것, 수식이 `text`에서 빠진다는 것. 요약: `docs/astro-notes/_refs/toc.md`.
