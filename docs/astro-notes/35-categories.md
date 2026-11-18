# 35. 카테고리와 개인 블로그 문구

## 한 줄 요약

글마다 `category` 하나를 필수로 받는다(`개발`·`부동산`·`일상`). 목록은 `src/lib/categories.ts` 한 곳에만 두고, 스키마(`z.enum`), `/categories`, `/categories/<slug>`, sitemap, 글 머리의 링크, `article:section`·JSON-LD `articleSection`, RSS `<category>`가 모두 이 목록을 읽는다. 사이트 이름은 "김동희의 블로그"가 되었고, 헤더는 "김동희입니다 / 개발과 부동산, 일상을 기록합니다"가 되었다. 새 feature 검사 `categories`가 frontmatter에서 계산한 값과 빌드 결과를 맞춰 본다.

## 개념

- **목록 한 곳**: `CATEGORIES`는 `{ id, name, slug, description }` 배열이고 `as const`로 둔다. 그래서 `CATEGORY_NAMES`의 타입이 `"개발" | "부동산" | "일상"` 튜플이 되고, `z.enum(CATEGORY_NAMES)`에 그대로 들어간다. 카테고리를 더할 때는 한 줄만 고친다. 배열 위에 `// prettier-ignore`를 두어 Prettier가 항목을 여러 줄로 펴지 않게 한다. 검증 장치도 이 한 줄 모양을 읽는다.
- **순환 import 피하기**: `content.config.ts`가 `categories.ts`를 가져온다. 그래서 `categories.ts`는 `astro:content`도 `site.ts`(`astro:env`)도 가져오지 않는 순수 모듈로 둔다. 글을 묶는 `groupByCategory(posts)`는 글 목록을 인자로 받는다. 덕분에 Vitest에서 가짜 글로 바로 시험할 수 있다(`src/lib/categories.test.ts`).
- **빈 카테고리도 페이지가 있다**: `getStaticPaths`는 글이 있는 카테고리가 아니라 목록 전체를 돈다. 처음 부동산 글을 쓰는 날에도 라우트 집합이 바뀌지 않고, 밖에서 건 링크가 404가 되지 않는다. 빈 페이지에는 "아직 글이 없습니다"가 나온다. sitemap에는 `lastmod` 없이 싣는다.
- **slug는 ASCII 고정값**: 태그는 키워드에서 slug를 계산하지만(`void-요소`), 카테고리는 `dev`·`real-estate`·`life`를 직접 적는다. 그래서 인코딩이나 충돌 검사가 필요 없다. 이름을 바꿔도 주소는 그대로다.
- **초안**: `posts/draft/`의 초안에도 `category: 개발`을 넣었다. 초안 스키마는 같은 `fields`를 펼쳐 쓰므로 `category`가 필수다. frontmatter가 아예 없던 초안 하나에는 `category`만 있는 frontmatter를 더했다.

## Next.js 대응

| Next.js                                                   | Astro (이 저장소)                                             |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| `app/categories/[slug]/page.tsx` + `generateStaticParams` | `src/pages/categories/[category].astro` + `getStaticPaths`    |
| frontmatter를 직접 파싱한 뒤 zod로 검사                   | `content.config.ts`의 `z.enum(CATEGORY_NAMES)`(빌드가 멈춤)   |
| `app/sitemap.ts`                                          | `src/pages/sitemap.xml.ts`(엔드포인트)                        |
| `metadata.openGraph.section`                              | `Seo.astro`의 `section` → `article:section`, `articleSection` |

## 빌드 결과물에서 확인하기

- `dist/categories.html`, `dist/categories/{dev,real-estate,life}.html`. `dev`에는 글 12개가 최신순으로 있고, 나머지 둘은 비어 있다.
- 글 페이지: `<p class="post-category"><a href="/categories/dev">개발</a></p>`가 제목 위에 있다. `<meta property="article:section" content="개발">`, JSON-LD에 `"articleSection":"개발"`이 있다.
- `dist/rss.xml`: `<item>`마다 `<category>개발</category>`가 있다. `@astrojs/rss`의 `categories: string[]` 옵션이다.
- `dist/sitemap.xml`: 끝에 `/categories`와 카테고리 주소 셋이 있다.

## 닫힌 고리가 잡아낸 것

- 스키마에서 `category`를 필수로 만들자 자체 검증 `build:` 사례가 쓰는 시험용 글(`lib/cli-cases.mjs`의 `post()`)도 `category`가 있어야 했다. 이것을 빼먹으면 "올바른 글" 대조군이 스키마 오류로 실패한다.
- `hover` parity 검사가 글 페이지 12개에서 "링크 수 22 → 23"으로 실패했다. 라우트 전체를 허용하지 않고 accept 항목에 `mask: [".post-category"]`를 주었다. 그러면 새 링크만 빠지고 나머지 링크의 hover는 기준선과 같아야 통과한다.
- `head` 검사는 글 페이지에서 실패하지 않았다. 글 `<title>`에는 사이트 이름이 없고, `og:site_name`과 `article:*`는 기준선과 비교하는 항목이 아니다. 그 둘은 `seo`와 `categories`(feature 검사)가 맡는다.
- `categories` 변이 11개(글 삭제, 순서 바꿈, 초안 추가, 빈 카테고리에 다른 글, 페이지 삭제·추가, 개수, 링크 대상, `articleSection`, `article:section`, sitemap)가 모두 FAIL을 냈다. 링크를 `../categories/dev.html`로 적은 것은 PASS여야 한다(accepted).

## 직접 해볼 실험

끝나면 바꾼 줄을 되돌린다.

1. `posts/regular-expression-1.md`의 `category: 개발`을 `category: 재테크`로 바꾸고 `npm run build`.
   <details><summary>예상 결과</summary>빌드가 멈춘다. `InvalidContentEntryDataError`가 `category`와 받는 값 `"개발" | "부동산" | "일상"`을 말한다. `재테크`를 쓰려면 `src/lib/categories.ts`에 한 줄을 더한다. 그러면 `/categories/<slug>`와 sitemap 주소가 저절로 생긴다.</details>
2. 같은 글을 `category: 일상`으로 바꾸고 `npm run verify -- --feature --only=categories`.
   <details><summary>예상 결과</summary>PASS. 검사는 frontmatter에서 기대값을 계산하므로 `/categories/life`에 그 글 하나, `dev`에 11개를 기대하고, 사이트도 그렇게 나온다. `/categories`의 개수도 `(11)`, `(0)`, `(1)`이 된다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/content-collections/ (`defineCollection`, 스키마, `z.enum`)
- https://docs.astro.build/en/reference/routing-reference/#getstaticpaths (`getStaticPaths`, `params`, `props`)
- https://docs.astro.build/en/recipes/rss/ (`@astrojs/rss`의 `items[].categories`)
- https://schema.org/BlogPosting (`articleSection`)
- https://ogp.me/#type_article (`article:section`)
