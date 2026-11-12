# 10. SEO 메타 태그와 구조화 데이터

## 한 줄 요약

배포본과 같은 head 태그 18개(05)는 값 하나 건드리지 않고, `src/components/Seo.astro`에 robots, Open Graph 보강, `article:*`, sitemap 링크, generator, JSON-LD를 더했다. 홈의 head 태그는 18 → 28개에 JSON-LD 하나가 붙었고, 새 기능 검사 `seo`가 14개 라우트에서 이 태그들이 서로 어긋나지 않는지 본다(`seo 14/14`. 배포본과 대조하는 `head`는 그대로 통과하고, 지금은 `/404`의 필수 태그까지 세어 `14/14`다).

## 개념

태그는 읽는 쪽에 따라 묶인다.

| 묶음                                              | 읽는 쪽                    | 무엇에 쓰나                                                                                                                     |
| ------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `robots`                                          | 검색 엔진 크롤러           | 색인 여부(`/404`만 `noindex`)와 검색 결과 미리보기의 한도(`max-image-preview:large`, `max-snippet:-1`)                          |
| `og:site_name`, `og:locale`, `og:image:*`         | 링크 미리보기(메신저, SNS) | 카드에 쓸 사이트 이름과 언어, 이미지를 받기 전에 알 수 있는 크기·형식, 이미지를 못 보는 사람을 위한 설명                        |
| `twitter:image:alt`                               | X 카드                     | 위와 같은 이미지 설명                                                                                                           |
| `article:published_time`, `article:tag`           | 링크 미리보기, 수집기      | `og:type`이 `article`인 페이지의 발행일과 태그. 태그는 키워드마다 하나씩 반복한다                                               |
| JSON-LD(`WebSite`, `BlogPosting`)                 | 검색 엔진                  | 홈의 `WebSite`는 구글이 검색 결과의 사이트 이름을 정할 때 가장 중요하게 보는 신호다. `BlogPosting`은 글의 제목·날짜·작성자·그림 |
| `<link rel="sitemap">`, `<meta name="generator">` | 도구                       | Astro 문서의 관례. sitemap 주소는 `public/robots.txt`의 `Sitemap:` 줄과 같다                                                    |

- **값은 페이지 → 레이아웃 → 컴포넌트로 props를 타고 내려간다.** `src/pages/posts/[id].astro`가 `seo={{ title, description, url: postUrl(post.id), type: "article", keywords, publishedTime: date }}`를 `BaseLayout`에 넘긴다. `BaseLayout.astro`는 `seo: SeoProps`(`Seo.astro`가 export 한 `Props`)로 받아 `<Seo {...seo} />`로 펼친다. 그래서 `Seo.astro`의 `Props`에 `publishedTime?: Date`와 `noindex?: boolean`을 더했을 뿐 레이아웃은 한 줄도 고치지 않았다. `404.astro`는 `noindex: true`만 더했고 홈은 그대로다.
- **페이지 종류는 이미 받은 props에서 끌어낸다.** `type === "article"`이면 `article:*`와 `BlogPosting`, `url === SITE.url`이면 `WebSite`(구글은 `WebSite`를 홈에서만 읽는다), 나머지(404)는 JSON-LD가 없다. 사이트 전체가 같은 값(`locale`, `ogImageWidth`, `ogImageAlt` 등)은 `src/lib/site.ts`의 `SITE`에 있다.
- **없는 값은 키째로 뺀다.** 템플릿에서는 `{isArticle && published && (<meta … />)}`와 `keywords.map(…)`, JSON-LD에서는 `description: description || undefined`(`JSON.stringify`가 `undefined`인 키를 버린다).
- **`set:html`은 이스케이프하지 않는다.** `<script is:inline type="application/ld+json" set:html={jsonLd} />`의 `jsonLd`는 `JSON.stringify(…).replace(/</g, "\\u003c")`다. 제목에 `</script>`가 있어도 스크립트가 거기서 끝나지 않고, `JSON.parse` 하면 원래 문자로 돌아온다.
- **`Astro.generator`** 는 `"Astro v7.4.11"` 같은 문자열이다. 템플릿의 `<!-- -->` 주석은 출력에 실리므로 설명은 펜스 안에 적는다.
- **대조 검사와 기능 검사.** `head`(대조)는 기준선에 있는 필드를 새 빌드의 같은 필드와 비교한다. 기준선에 없던 태그는 거의 보지 않으므로 새 태그에 무엇을 적어도 대개 통과한다. 예외는 페이지를 검색에서 빼거나 다른 곳으로 보내는 태그뿐이다(robots의 `noindex`·`nofollow`·`none`, `<meta http-equiv="refresh">`, `<base>`. H1에서 더했다). `seo`(`scope: "feature"`)는 기준선을 읽지 않고 **새 빌드 안의 두 값을 서로** 비교한다: `og:title` = `<title>`, `og:url` = canonical, `article:published_time` = `<time datetime>`, JSON-LD `headline` = `<title>`, `og:image:width` = 이미지 파일 헤더에서 읽은 폭. 자체 검증도 다르다. 대조 검사는 "기준선 ↔ 기준선은 통과, 변이한 기준선은 실패", 기능 검사는 "`dist/`는 통과, 변이한 `dist/` 사본은 실패"다.

## Next.js 대응

| 예전 (`git show main:<경로>`)                                                                     | 지금                                                                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pages/index.page.tsx`, `pages/posts/[id].page.tsx`의 `<Head>` 태그 14개. robots도 JSON-LD도 없다 | `src/components/Seo.astro`: 같은 14개 + 새 태그. 페이지는 `seo={{ … }}`에 값만 넘긴다      |
| 날짜는 `<time dateTime={date.toISOString()}>`에만 있었다                                          | `[id].astro`의 `publishedTime: date` → `article:published_time`, `datePublished`           |
| Next 기본 404 화면: head에 robots 메타가 없다(`.verify/baseline/404.html`)                        | `src/pages/404.astro`의 `noindex: true` → `<meta name="robots" content="noindex, follow">` |
| (썼다면) `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: … }} />`          | `<script is:inline type="application/ld+json" set:html={jsonLd} />`                        |
| 이미지 주소가 두 페이지 파일에 문자열로                                                           | `src/lib/site.ts`의 `SITE.ogImage`와 그 옆의 `ogImageWidth`·`Height`·`Type`·`Alt`          |

## 빌드 결과물에서 확인하기

- `grep -o '<meta name="robots"[^>]*>' dist/index.html dist/404.html` → 홈은 `content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"`, 404는 `content="noindex, follow"`.
- `grep -o '<meta property="og:image[^>]*>' dist/index.html` → `og:image`, `og:image:type`(`image/jpeg`), `og:image:width`(`380`), `og:image:height`(`240`), `og:image:alt` 순서로 5줄. Open Graph는 `og:image:*`를 직전의 `og:image`에 붙이므로 순서가 뜻을 갖는다.
- `grep -o '<meta property="article:[^>]*>' dist/posts/proxy-to-built-in-objects.html | wc -l` → 10(`article:published_time` 1 + `article:tag` 9). 키워드가 없는 `css-masters-2-week2.html`은 `<meta property="article:published_time" content="2022-05-15T00:00:00.000Z">` 한 줄뿐이다.
- `grep -o '"@type":"[A-Za-z]*"' dist/index.html` → `WebSite`, `Person`. 글은 `BlogPosting`, `Person`, `WebPage`. `grep -c 'application/ld+json' dist/404.html` → 0.
- `dist/posts/css-masters-2-week2.html`의 JSON-LD는 `{"@context":"https://schema.org","@type":"BlogPosting","headline":"css-masters-2 2주차 정리","datePublished":"2022-05-15T00:00:00.000Z","author":{…},…,"inLanguage":"ko"}`이다. `description`과 `keywords` 키가 없다(글 12개 중 각각 9개, 10개가 그렇다).

## 닫힌 고리가 잡아낸 것

- **Red를 먼저 봤다.** 검사만 쓰고 돌리면 `seo 0/14`(`robots: missing; og:site_name: missing; … JSON-LD: found 0, expected exactly 1`)이고, 자체 검증은 `Error: mutation changed nothing in: index.html`로 멈춘다(지울 `og:locale`이 아직 없다. 헛도는 변이를 `mutateFile`이 예외로 알린다). 구현 뒤 첫 실행에서 `seo 14/14`, `head 13/13`, `SELFTEST PASS 7/7`이다.
- **통과가 "아무것도 안 봐서"가 아닌지 확인했다.** `dist/` 사본에서 규칙을 하나씩 깨는 일회용 스크립트로 47가지를 돌렸고 전부 그 규칙의 이름으로 실패했다. 예: `og:image`를 `email.png`로 바꾸면 `og:image:width: 380, but /email.png is 512x512`.
- **검사기의 구멍 하나**: JSON-LD 블록이 `null`이나 배열로 파싱되면 필드를 읽다 예외가 나 `check crashed`가 될 코드였다(읽다가 발견) → 타입부터 확인하게 고쳤고 지금은 `JSON-LD @type: (none), expected WebSite`로 나온다.
- **HTML 주석**: `og:image:*`의 순서 설명을 템플릿에 `<!-- -->`로 적었다가 펜스 안으로 옮겼다. 그대로 빌드해 보면 14개 페이지 전부에 그 주석이 실린다.
- **문서와 달랐던 것**: 구글의 robots 문서에는 `index`, `follow`가 규칙 목록에 없다(기본값이라 적어도 효과가 없다). 해가 없어 그대로 두고 `Seo.astro`에 주석으로 남겼다.

## 직접 해볼 실험

1. `src/lib/site.ts`의 `ogImageWidth: 380`을 `1200`으로 바꾸고 `npm run -s verify -- --only=head,seo`.
   <details><summary>예상 결과</summary>`PASS head 14/14`, `FAIL seo 0/14  /: og:image:width: 1200, but /main-og-image.jpg is 380x240 | …`. `head`는 기준선에 없던 `og:image:width`를 보지 않고, `seo`는 `dist/main-og-image.jpg`의 헤더를 읽어 대조한다.</details>
2. `src/pages/posts/[id].astro`에서 `publishedTime: date,` 줄을 지우고 같은 명령.
   <details><summary>예상 결과</summary>`check`, `build`, `head 14/14`는 PASS다(선택 prop이라 타입 오류가 아니다). `FAIL seo 2/14  /posts/css-masters-2-week1: article:published_time: missing | … (+9 more)`. JSON-LD에서도 키가 빠진다: `grep -c datePublished dist/posts/css-masters-2-week1.html` → 0.</details>
3. `src/lib/site.ts`의 `description`을 `"</script><b>프론트엔드</b>"`로 바꾸고 `npm run -s verify -- --only=seo --no-check`, `grep -o '"description":"[^"]*"' dist/index.html`. 이어서 `Seo.astro`의 `.replace(/</g, "\\u003c")`를 지우고 두 명령을 다시.
   <details><summary>예상 결과</summary>처음에는 `PASS seo 14/14`이고 `"description":"\u003c/script>\u003cb>프론트엔드\u003c/b>"`다. 이스케이프를 지우면 `"description":"</script><b>프론트엔드</b>"`가 그대로 나가고 `FAIL seo 13/14  /: JSON-LD #1 does not parse: Unterminated string in JSON at position 125 (line 1 column 126)`이다. HTML 파서가 첫 `</script>`에서 스크립트를 끝내고 나머지 `<b>프론트엔드</b>","inLanguage":…`를 HTML로 읽는다.</details>

## 문서 근거

- https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag (`noindex`, `max-snippet`, `max-image-preview`, `max-video-preview`. `index`·`follow`는 목록에 없다)
- https://developers.google.com/search/docs/appearance/structured-data/article (필수 속성은 없다. 권장: `headline`, `image`, `datePublished`, `author.name`, `author.url`. 날짜는 시간대를 붙인 ISO 8601)
- https://developers.google.com/search/docs/appearance/site-names (`WebSite`의 `name`·`url`은 홈에 둔다. `og:site_name`도 본다)
- https://ogp.me/ (`og:site_name`, `og:locale`의 `language_TERRITORY`, `og:image:*`의 순서, `article:published_time`, `article:tag`)
- https://docs.astro.build/en/reference/directives-reference/ (`set:html`은 이스케이프하지 않는다, JSON-LD 예시, `is:inline`)
- https://docs.astro.build/en/reference/api-reference/ (`Astro.generator`), https://docs.astro.build/en/guides/integrations-guide/sitemap/ (`<link rel="sitemap">`)
- 확인하지 못한 것: X의 카드 문서는 열리지 않아(402) `twitter:image:alt`는 문서로 대조하지 못했다. 문서에 없어 직접 확인한 것: 템플릿의 HTML 주석이 출력에 실리는 것, `undefined`인 키가 JSON-LD에서 빠지는 것.
