# 17. 시리즈: file() 로더와 reference()

## 한 줄 요약

`src/content/series.json`을 `file()` 로더로 읽는 `series` 컬렉션을 만들고, 글 순서를 `z.array(reference("posts"))`로 적었다. `src/lib/series.ts`가 `getEntries()`로 참조를 글로 바꾸며 없는 글이면 빌드를 멈추고, `SeriesNav.astro`가 css-masters-2 1~4주차 글 아래에 "시리즈: css-masters-2 (n/4)"와 이전/다음 링크를 그린다.

## 개념

- **`file()` 로더**는 JSON·YAML 파일 하나를 컬렉션으로 읽는다. 배열이면 항목 하나가 항목 하나다. `glob()`과 달리 id를 만들지 않아서 항목마다 `id`가 있어야 한다. 스키마는 `id`를 포함한 객체 전체를 받는다(`strictObject`라 `id`를 적어 두었다).
- **`reference("posts")`**는 문자열 id를 `{ collection: "posts", id }`로 바꿀 뿐, 그 글이 **있는지 보지 않는다**(`node_modules/astro/dist/content/runtime.js`의 `createReference`). 없는 id도 스키마 검사를 통과한다.
- **`getEntries(refs)`**는 참조 배열을 같은 순서의 글 배열로 바꾼다. 없는 글 자리에는 `undefined`가 들어간다. 타입은 `CollectionEntry<"posts">[]`라 `undefined`가 보이지 않으니 직접 확인해야 한다.
- 그래서 "없는 글을 가리키면 빌드 실패"는 내가 만든다: `lib/series.ts`의 `load()`가 `undefined` 자리를 찾아 `throw`한다. 모든 글 페이지가 `SeriesNav`를 렌더하므로, 시리즈와 무관한 글 페이지에서도 빌드가 멈춘다.
- 한 글이 두 시리즈에 있으면 이전/다음이 둘이 되므로 그것도 멈춘다. 운영 빌드에서는 초안을 순서에서 뺀다(페이지가 없어 링크가 깨진다).
- 결과는 모듈 변수에 한 번만 담는다(`cache ??= load()`). dev에서는 매번 읽어 json을 고친 것이 바로 보인다.

## Next.js 대응

| 예전 (배포본)                     | 지금 (S5.2)                                                        |
| --------------------------------- | ------------------------------------------------------------------ |
| 시리즈 개념 없음                  | `series` 컬렉션(`file("src/content/series.json")`)                 |
| 글 목록은 `fs.readdirSync` + 정렬 | 순서는 데이터 파일이 정한다: `posts: ["css-masters-2-week1", …]`   |
| 글 사이 관계를 표현할 방법 없음   | `z.array(reference("posts"))` → `getEntries()`                     |
| 없는 글 링크는 404로 배포         | `lib/series.ts`가 빌드를 멈춘다: `시리즈 "…"가 없는 글을 가리킨다` |
| (컴포넌트 없음)                   | `SeriesNav.astro`: `nav[aria-label="시리즈"]`, `rel="prev"/"next"` |

## 빌드 결과물에서 확인하기

- `dist/posts/css-masters-2-week2.html`: `<nav class="series" aria-label="시리즈">` 안에 `<p>시리즈: css-masters-2 (2/4)</p>`, `<a href="/posts/css-masters-2-week1" rel="prev">← 이전 글: css-masters-2 1주차 정리</a>`, `rel="next"`는 3주차.
- 1주차에는 `rel="prev"`가, 4주차에는 `rel="next"`가 없다. 다른 글 8개에는 `nav.series`가 없다.
- `npm run verify`: 새 feature 검사 `series` 12/12. `embeds`·`visual`은 4개 글 라우트만, `hover`는 `mask: ["nav.series"]`로(`scripts/verify/accepted/s5-2-series.json`).

## 닫힌 고리가 잡아낸 것

- **Red**: 검사 `series`를 먼저 썼다(순서를 검사 안에 직접 적었다. json을 읽으면 틀린 순서를 그대로 베낀다). 스텁 상태에서 `FAIL series 8/12`, 4개 글 모두 `has 0 series nav(s)`.
- **Green**: 컬렉션·`lib/series.ts`·`SeriesNav` 뒤 12/12. 자기 검사는 순서 바꿈, 첫 글의 이전 링크, 순번 바꿈, nav 삭제, 시리즈 밖 새 글 페이지의 nav 다섯 변이를 모두 잡는다.
- **없는 글**: json의 4주차를 `css-masters-2-week5`로 바꾸자 `astro build`가 종료 코드 1, `[ERROR] Error: 시리즈 "css-masters-2"(src/content/series.json)가 없는 글을 가리킨다: css-masters-2-week5`. 확인 없이 두면 `reference()`는 통과하고 `getEntries()`가 `undefined`를 돌려준다.
- **embeds**: 처음 전체 검증에서 `embeds`가 4개 글에서 실패했다. utterances `<script>`의 앞 요소가 `main` → `nav`가 된 것뿐이다(속성·부모·다음 요소는 같다). 이음매 커밋의 배치 그대로라 허용으로 적었다.
- `content`·`a11y`는 처음부터 통과: nav는 `<main>` 밖이고, 글자색은 본문을 그대로 물려받는다.

## 직접 해볼 실험

끝나면 `git checkout src/content/series.json src/lib/series.ts`로 되돌린다.

1. `src/content/series.json`의 `"css-masters-2-week3"`과 `"css-masters-2-week4"`의 순서를 바꾸고 `npm run -s verify -- --feature --only=series --no-check`.
   <details><summary>예상 결과</summary>`FAIL series`. 2·3·4주차가 실패한다(예: 2주차 `next link "/posts/css-masters-2-week4" does not point at /posts/css-masters-2-week3`, 3주차 `label "시리즈: css-masters-2 (4/4)" ≠ …`).</details>
2. `src/lib/series.ts`에서 `if (missing.length > 0) throw …` 문을 지우고, json에 `"no-such-post"`를 더한 뒤 `npx astro build --force`.
   <details><summary>예상 결과</summary>빌드가 `undefined` 글의 `.id`를 읽다가 `TypeError`로 멈추거나, 걸러내면 조용히 통과한다. `reference()` 혼자서는 없는 글을 잡지 못한다는 뜻이다.</details>
3. json 항목에서 `"id"`를 지우고 `npx astro build --force`.
   <details><summary>예상 결과</summary>`[ERROR] [file-loader] Item in src/content/series.json is missing an id or slug field.`가 찍히지만 **종료 코드는 0**이다. 항목이 버려져 `series` 컬렉션이 비고(`[WARN] The collection "series" does not exist or is empty`), 시리즈 탐색이 사라진다. 이것은 빌드가 아니라 `series` 검사가 잡는다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/content-collections/ (`file()` 로더, 항목마다 `id`)
- https://docs.astro.build/en/reference/modules/astro-content/ (`reference()`, `getEntries()`가 없는 참조 자리에 `undefined`)
- 문서에 없어 직접 확인한 것: `reference()`의 변환이 존재를 검사하지 않는다는 것(`node_modules/astro/dist/content/runtime.js`의 `createReference`). 요약: `docs/astro-notes/_refs/series.md`.
