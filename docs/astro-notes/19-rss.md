# 19. RSS: 엔드포인트와 `@astrojs/rss`

## 한 줄 요약

`src/pages/rss.xml.ts`(정적 엔드포인트)가 `@astrojs/rss`의 `rss()`로 발행된 글 12개를 최신 글 먼저 담은 `/rss.xml`을 만들고, `Seo.astro`가 모든 페이지 `<head>`에 `<link rel="alternate" type="application/rss+xml">`을 단다. 새 feature 검사 `rss`가 피드를 페이지의 canonical·제목·설명·발행일과 맞춰 본다.

## 개념

- **`rss()`는 `Response`를 돌려준다.** 그래서 `export const GET = () => rss({...})`이 곧 엔드포인트다. sitemap처럼 XML을 손으로 조립할 필요가 없고, 이스케이프도 라이브러리(fast-xml-parser)가 한다.
- **파일 이름의 확장자가 주소가 된다.** `rss.xml.ts` → `dist/rss.xml`. 확장자가 있는 엔드포인트는 `trailingSlash`와 상관없이 슬래시 없는 주소로만 나간다.
- **`trailingSlash: false`**: `rss()`의 기본값(`true`)은 상대 경로 `link`와 channel `<link>` 끝에 `/`를 붙인다. 이 사이트는 `trailingSlash: "never"`라 꺼야 channel 링크가 `https://bigsaigon333.github.io`(홈 canonical)와 같아진다.
- **절대 URL `link`는 그대로 나간다**(`isValidURL`이면 손대지 않는다, `node_modules/@astrojs/rss/dist/index.js`). 그래서 `postUrl(id)`를 넘겨 글 페이지의 canonical·sitemap `<loc>`과 문자 하나까지 같게 했다. `<guid isPermaLink="true">`도 같은 값으로 붙는다.
- **`pubDate`는 `Date`를 받아 `toUTCString()`**(RFC 822)으로 쓴다. 글의 `date`가 UTC 자정이라 `Sun, 25 Jun 2023 00:00:00 GMT`가 된다.
- **빈 설명은 `undefined`로** 넘겨 `<description>`을 내지 않는다. 항목에는 `title`이나 `description` 중 하나만 있으면 된다.
- **`customData`**는 channel 안에 그대로 끼워 넣는 XML 문자열이다. `<language>ko</language>`를 넣었다.

## Next.js 대응

| 예전 (배포본)                                                            | 지금 (S5.4)                                                                     |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 피드 없음                                                                | `src/pages/rss.xml.ts`: `GET` → `rss({ title, description, site, items, ... })` |
| (Next.js라면) `feed` 패키지 + `getStaticProps`에서 `public/rss.xml` 쓰기 | 엔드포인트가 빌드 때 한 번 불려 `dist/rss.xml`이 된다                           |
| autodiscovery 없음                                                       | `Seo.astro`: `<link rel="alternate" type="application/rss+xml" title href>`     |
| 글 목록: `getSortedPosts()`                                              | `getPublishedPosts()`(초안 제외, 날짜 내림차순) — sitemap과 같은 함수           |

## 빌드 결과물에서 확인하기

- `dist/rss.xml`: `<rss version="2.0"><channel><title>김동희의 개발블로그</title>…<link>https://bigsaigon333.github.io</link><language>ko</language><item>…`.
- `grep -o '<item>' dist/rss.xml | wc -l` → 12(sitemap의 글 `<loc>` 수와 같다). `<description>`은 4개(channel 1 + 설명 있는 글 3).
- 첫 항목은 `proxy-to-built-in-objects`, `<link>`는 `https://bigsaigon333.github.io/posts/proxy-to-built-in-objects`(끝 슬래시 없음).
- `grep -o '<link rel="alternate"[^>]*>' dist/index.html` → `href="https://bigsaigon333.github.io/rss.xml"`. 글 페이지와 404에도 있다.
- `npm run verify` 17/17 통과, accept 파일 없이. `head`는 기준선에 없는 `<link>`를 보지 않고, `routes`는 기준선의 자산만 본다.

## 닫힌 고리가 잡아낸 것

- **Red**: 검사 `rss`를 먼저 쓰고 피드 없이 돌리면 `/rss.xml: missing in candidate`로 실패한다.
- **자기 검사의 변이 8개**: 가장 최근 항목 삭제(항목 수 ≠ 발행 글 수), link 끝 슬래시(≠ canonical), 항목 주소를 초안으로(항목 수는 그대로, 초안 규칙만 잡는다), 순서 뒤집기(pubDate 증가), 맨 `&`(well-formed 아님), description 변경, 홈의 alternate 링크 삭제, 피드에 없는 새 글 페이지(`--route`가 새 글만 볼 때도 잡는다).
- 처음 초안 변이는 항목을 **더했는데**, 그러면 항목 수 규칙이 먼저 실패해 초안 규칙이 실제로 도는지 증명하지 못했다. 기존 항목의 주소를 바꾸는 변이로 고쳤다.
- "발행된 글 수"는 빌드가 아니라 `posts/`의 원본에서 센다. 빌드 쪽 목록과 비교하면 빌드가 글 하나를 빠뜨렸을 때 둘 다 같이 빠져 통과한다.

## 직접 해볼 실험

끝나면 `git checkout src/pages/rss.xml.ts`로 되돌린다.

1. `trailingSlash: false,` 줄을 지우고 `npm run -s verify -- --feature --only=rss`.
   <details><summary>예상 결과</summary>`FAIL rss`. channel `<link>`가 `https://bigsaigon333.github.io/`가 되어 홈 canonical과 다르다. 항목 link는 절대 URL이라 그대로다.</details>
2. `getPublishedPosts()`를 `getCollection("posts")`로 바꾸고(import 추가) 같은 명령.
   <details><summary>예상 결과</summary>초안이 없으면 통과하지만 순서가 정해지지 않아 `pubDate … is newer than the item before`가 날 수 있다. 최상위에 `draft: true` 글을 두면 항목 수와 초안 규칙으로 실패한다.</details>
3. `description: post.data.description || undefined`를 `description: post.data.description`으로 바꾸고 `dist/rss.xml`을 본다.
   <details><summary>예상 결과</summary>설명 없는 글에도 `<description></description>`이 생긴다. 검사는 빈 문자열을 빈 meta description과 같게 보므로 통과한다.</details>

## 문서 근거

- https://docs.astro.build/en/recipes/rss/ (`rss()` 옵션, 컬렉션 항목, `trailingSlash`, autodiscovery `<link>`)
- https://docs.astro.build/en/guides/endpoints/ (정적 엔드포인트, 확장자 있는 주소와 trailing slash)
- https://github.com/withastro/astro/tree/main/packages/astro-rss (옵션 전체. 설치본 4.0.19의 `dist/index.js`로 확인)
