# 02. 콘텐츠 컬렉션: 로더, 스키마, getCollection

## 한 줄 요약

`lib/posts.ts`가 `readdirSync` + gray-matter + superstruct로 하던 "파일 찾기 → frontmatter 파싱 → 검증"이 `src/content.config.ts`의 선언 하나가 됐고, 잘못된 frontmatter는 파일 이름을 짚으며 빌드를 멈춘다.

## 개념

- **컬렉션 = 로더(어디서 읽나) + 스키마(어떤 모양이어야 하나).** `src/content.config.ts`가 `collections`를 export 하면 Astro가 빌드 맨 앞의 `Syncing content` 단계에서 한 번에 읽고 검증한다.
- **로더** `glob({ pattern: "*.md", base: "./posts" })`: `base`는 프로젝트 루트 기준이고 `src/` 밖이어도 된다(문서에 예시가 없어 직접 확인했다). 패턴이 `*.md`라서 `posts/draft/`의 초안 21개는 읽지 않는다.
- **id**: 기본 `generateId`는 경로를 github-slugger로 바꾼다(`Zz_Fixture Upper.md` → `zz_fixture-upper`). 이 블로그는 id가 곧 URL이라 `generateId`로 "파일 이름에서 `.md`만 뗀 것"으로 고정했다.
- **스키마**는 Zod 4(`astro/zod`)다. `z.iso.date()`는 실제 달력 날짜인 `"YYYY-MM-DD"` 문자열만 통과시키고, `.transform`이 UTC 자정의 `Date`로 바꾼다. `keywords`는 `"a, b"` → `["a", "b"]`, 없으면 `[]`. 스키마의 출력 타입이 `CollectionEntry<"posts">["data"]`의 타입이 된다(`.astro/content.d.ts`).
- **데이터 스토어**: 검증된 데이터와 렌더된 HTML은 `node_modules/.astro/data-store.json`에 들어간다. 파일 내용의 digest가 같으면 다음 빌드에서 다시 파싱하지 않는다. `getCollection("posts")`는 파일 시스템이 아니라 이 스토어를 읽는다.
- **순서는 보장되지 않는다.** 그래서 `getPublishedPosts()`가 날짜 내림차순으로 직접 정렬한다(같은 날짜면 id 순).
- **날짜 표시**는 `formatDate()` = `toISOString().slice(0, 10)`. UTC 기준이라 빌드하는 곳의 시간대를 타지 않는다.

## Next.js 대응

| 예전 (`git show main:lib/posts.ts`)                                                 | 지금                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `readdirSync(postsDirectory).filter(/\.md$/)`                                       | `glob({ pattern: "*.md", base: "./posts" })`                                    |
| `fileName.replace(/\.md$/, "")`                                                     | `generateId`                                                                    |
| `matter.read(fullPath)`                                                             | 로더가 frontmatter와 본문을 나눈다                                              |
| superstruct `MatterData` (`coerce(date(), string(), …)`, `defaulted(string(), "")`) | Zod 스키마 (`z.iso.date().transform(…)`, `.default("")`)                        |
| `getSortedPostsData()` + date-fns `compareDesc`                                     | `src/lib/posts.ts`의 `getPublishedPosts()`                                      |
| date-fns `format(date, "yyyy-MM-dd")` (로컬 시간대)                                 | `formatDate()` (UTC)                                                            |
| `pages/index.page.tsx`의 `getStaticProps` → props → JSX                             | `src/pages/index.astro` 펜스의 `await getPublishedPosts()` → 같은 파일의 템플릿 |
| `next-superjson-plugin` (`Date`를 props로 넘기려고)                                 | 필요 없다. 직렬화 경계가 없다                                                   |

예전 `keywords`는 `split(",")`만 해서 배포본 메타가 `"Proxy,  Map,  …"`(공백 두 칸)였다. 지금은 trim 한다.

## 빌드 결과물에서 확인하기

- `dist/index.html`: `<section>` 안에 `<article><a href="/posts/<id>"><h2>…</h2></a><time datetime="2023-06-25T00:00:00.000Z">2023-06-25</time></article>`가 12개, 최신 글부터 나온다. 배포본 `.verify/baseline/index.html`과 (href, 제목, datetime, 날짜) 목록이 순서까지 같다.
- `grep -c draft: dist/index.html` → 0.
- `.astro/collections/posts.schema.json`: 스키마에서 생성된 JSON Schema. `required`가 `title`, `date`뿐이다.

## 닫힌 고리가 잡아낸 것

- **잘못된 날짜**: `posts/zz-fixture-bad-date.md`에 `date: "not-a-date"`를 넣으면 빌드가 exit 1로 끝난다. 오류 한 줄: `[InvalidContentEntryDataError] posts → zz-fixture-bad-date data does not match collection schema.` 이어서 `date: Invalid ISO date`와 `Location: …/posts/zz-fixture-bad-date.md:0:0`이 나온다. `"2022-02-30"`도 같은 오류다.
- **시간대 검사가 실제로 잡는지**: `formatDate`를 로컬 시간 getter(`getFullYear()` 등, 예전 date-fns `format`과 같은 방식)로 바꾸고 `TZ=America/Los_Angeles`로 빌드하면 홈의 첫 글이 `2023-06-24`로 하루 밀린다 → 두 시간대 비교가 FAIL. 지금 구현은 `TZ=Asia/Seoul`과 `TZ=America/Los_Angeles`에서 모든 `<time>`이 같다.
- **스토어 캐시**: 시간대 비교는 빌드 사이에 `node_modules/.astro/data-store.json`을 지워야 의미가 있다. 안 지우면 두 번째 빌드는 첫 빌드가 파싱해 둔 `Date`를 재사용한다.
- **배포본과 소스의 불일치**(이 단계의 게이트 밖, `head` 검사에서 드러날 것): 배포본의 `css-masters-2-week1` description·keywords와 `regular-expression-1` description은 `posts/`의 frontmatter에 없다.

## 직접 해볼 실험

1. `src/content.config.ts`의 패턴을 `"**/*.md"`로 바꾸고 `npm run build`.
   <details><summary>예상 결과</summary>초안까지 읽다가 `posts → draft/draft:from-mathematics-to-generic-programming-ch07 data does not match collection schema`(`title: Required`, `date: Required`)로 실패한다. frontmatter가 없는 초안이다.</details>
2. 아무 글이나 복사해 `posts/zz-test.md`를 만들고 `date: 2022-05-08`처럼 따옴표를 빼고 빌드한다. 끝나면 파일을 지운다.
   <details><summary>예상 결과</summary>`date: Expected type "string", received "object"`. YAML이 따옴표 없는 날짜를 `Date` 객체로 만들기 때문이다. 스키마는 문자열만 받는다.</details>
3. `src/content.config.ts`에서 `generateId` 줄을 지우고 `posts/Zz_Test Upper.md`를 만들어 빌드한 뒤 `grep -o 'href="/posts/[Zz][^"]*"' dist/index.html`. 끝나면 되돌린다.
   <details><summary>예상 결과</summary>`href="/posts/zz_test-upper"`. `generateId`가 있으면 `href="/posts/Zz_Test Upper"`다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/content-collections/
- https://docs.astro.build/en/reference/modules/astro-content/ (`getCollection`, `CollectionEntry`)
- https://docs.astro.build/en/reference/content-loader-reference/ (`glob()`의 `pattern`, `base`, `generateId`)
- 문서에 없어 직접 확인한 것: `src/` 밖의 `base`, 최상위만 잡는 `*.md`, 오류 메시지에 파일 경로가 들어가는지, 스토어 위치.
