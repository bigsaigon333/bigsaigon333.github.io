# 08. 정적 엔드포인트와 404 페이지

## 한 줄 요약

`next-sitemap`이 만들어 `public/`에 커밋해 두던 `sitemap.xml`이 `src/pages/sitemap.xml.ts`의 `GET` 함수가 됐다. 빌드할 때마다 컬렉션에서 다시 만들어지므로 글을 추가하면 sitemap이 따라온다. 404는 Next 기본 화면 대신 `src/pages/404.astro`가 사이트 레이아웃으로 그린다.

## 개념

- **정적 엔드포인트**: `src/pages/` 안의 `.ts` 파일이 `GET`을 export 하면 페이지와 같은 라우트가 된다. 파일 이름에서 `.ts`만 떨어진다(`sitemap.xml.ts` → `/sitemap.xml`). 정적 출력에서는 빌드 때 `GET`이 한 번 불리고, 돌려준 `Response`의 **본문만** 파일이 된다. 상태 코드와 헤더는 남을 곳이 없다.
- **`Content-Type` 헤더**는 그래서 `astro dev`에서만 의미가 있다. 배포된 파일의 타입은 서버가 확장자를 보고 정한다(`astro preview`는 `text/xml`).
- **데이터는 페이지와 같은 곳에서 온다.** `getPublishedPosts()`로 홈(`SITE.url`, 끝 슬래시 없음)과 `postUrl(id)`를 싣는다. `<lastmod>`는 `formatDate(date)`이고, 홈은 가장 최근 글의 날짜다. `changefreq`, `priority`는 넣지 않았다.
- **확장자가 있는 엔드포인트는 `build.format`, `trailingSlash`와 무관하다.** `format: "directory"`로 빌드해도 `dist/sitemap.xml`이다.
- **`@astrojs/sitemap`을 쓰지 않은 이유**: 그 통합은 `sitemap-index.xml`을 만든다. `public/robots.txt`와 검색 엔진이 알고 있는 주소는 `/sitemap.xml`이다.
- **404**: `src/pages/404.astro` → `dist/404.html`. `format: "directory"`에서도 `404/index.html`이 아니라 루트의 `404.html`이다(문서 요약에 없어 직접 빌드해 확인했다). GitHub Pages는 없는 경로 어디에서든 이 파일을 404 상태로 돌려준다. 어느 깊이의 URL에서 열릴지 모르므로 링크는 `/`로 시작한다.
- **`/404`라는 주소 자체**는 파일이 있으니 200이다. 그래서 `noindex`가 있으면 좋은데, 지금 `BaseLayout`에는 페이지가 `<head>`에 무언가를 끼워 넣을 슬롯이 없다. 레이아웃은 이 단계의 소유 파일이 아니라 넣지 않고 보고만 했다.
- 404의 scoped `<style>`은 예전 `Section`(`pages/index.style.ts`), `Main`(`pages/posts/[id].style.ts`)과 같은 `width: 100%; flex-grow: 1`이다. 레이아웃의 세로 flex 안에서 푸터를 바닥에 두는 값이다.

## Next.js 대응

| 예전                                                                                               | 지금                                                                    |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `next-sitemap.config.js` + `package.json`의 `"postbuild": "next-sitemap"` → `public/sitemap.xml`   | `src/pages/sitemap.xml.ts`의 `GET` → `dist/sitemap.xml`                 |
| `lastmod`는 전부 도구를 돌린 시각, `changefreq` daily, `priority` 0.7                              | `lastmod`는 글의 `date`, 나머지는 없음                                  |
| (이 저장소에는 없던) `pages/api/*.ts`의 `handler(req, res)`: 서버가 필요해 `next export`와 못 쓴다 | 같은 "파일 = 라우트"지만 빌드 때 한 번 실행되어 파일로 굳는다           |
| `pages/404.tsx` 없음 → Next 기본 화면(`404: This page could not be found`)                         | `src/pages/404.astro` + `BaseLayout` (`404: 페이지를 찾을 수 없습니다`) |

## 빌드 결과물에서 확인하기

- 빌드 로그에 페이지들과 나란히 `├─ /sitemap.xml`이 찍힌다.
- `dist/sitemap.xml`: 16줄. 셋째 줄이 `<url><loc>https://bigsaigon333.github.io</loc><lastmod>2023-06-25</lastmod></url>`. `grep -c "<url>" dist/sitemap.xml` → 13, `grep -c "changefreq\|priority" dist/sitemap.xml` → 0, `xmllint --noout dist/sitemap.xml`은 아무 말 없이 끝난다.
- 배포본 `.verify/baseline/sitemap.xml`은 `<loc>`이 12개다. 최신 글 `proxy-to-built-in-objects`가 없고 `lastmod`가 전부 `2023-05-21T09:04:36.041Z`다. 이 한 개 차이는 `scripts/verify/allowlist.json`에 사유와 함께 적혀 있다.
- `dist/404.html`: `<title>404: 페이지를 찾을 수 없습니다</title>`, GA 스크립트 두 개, `<a href="/" data-astro-cid-…>홈으로 돌아가기</a>`, 인라인된 `<style>main[data-astro-cid-…]{flex-grow:1;width:100%}…`.

## 닫힌 고리가 잡아낸 것

구현 뒤 게이트 실패는 없음. Red는 예상대로 `FAIL sitemap 1/2 /sitemap.xml: missing in candidate`였다. 검증하다 알게 된 것:

- 계획서는 배포본 sitemap을 "URL 13개"라고 적었지만 실제 `<loc>`은 12개다(홈 + 글 11개). 새 sitemap이 13개다.
- 헤더를 지워도 `dist/sitemap.xml`의 sha1이 같다. 정적 빌드가 헤더를 버린다는 것을 이것으로 확인했다(실험 2).
- `noindex`를 넣을 방법이 레이아웃에 없다 → 오케스트레이터에게 보고(`<slot name="head" />` 한 줄이면 된다).

## 직접 해볼 실험

1. `git mv src/pages/sitemap.xml.ts src/pages/sitemap.ts` 뒤 `npm run -s verify -- --only=sitemap --no-check`, `ls dist`. 끝나면 되돌린다.
   <details><summary>예상 결과</summary>`FAIL sitemap 1/2 /sitemap.xml: missing in candidate`. `dist/sitemap.xml`은 없고 확장자 없는 XML 파일 `dist/sitemap`이 생긴다(`npm run build`의 로그에는 `├─ /sitemap`). URL은 파일 이름이 정한다.</details>
2. `sitemap.xml.ts`의 마지막을 `return new Response(xml);`로 바꾸고 `npm run dev` → `curl -s -o /dev/null -w '%{content_type}\n' localhost:4321/sitemap.xml`. 이어서 `npm run build && shasum dist/sitemap.xml`을 바꾸기 전과 비교한다.
   <details><summary>예상 결과</summary>dev 응답이 `application/xml; charset=utf-8`에서 `text/plain;charset=UTF-8`로 바뀐다. 빌드한 파일의 sha1은 같다.</details>
3. `npm run build && npm run preview` 뒤 `curl -s -o /dev/null -w '%{http_code}\n' localhost:4321/no/such/page`, 같은 명령으로 `/404`. 그다음 `astro.config.mjs`의 `format: "file"`을 `"directory"`로 바꾸고 빌드해 `ls dist dist/posts/regular-expression-1`. 끝나면 되돌린다.
   <details><summary>예상 결과</summary>`404`(본문은 `dist/404.html`)와 `200`. `npm run dev`에서는 `/404`도 404다. `directory`에서 글은 `dist/posts/<id>/index.html`이 되지만 `dist/404.html`과 `dist/sitemap.xml`은 그 자리 그대로다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/endpoints/ (정적 파일 엔드포인트, `GET`, `APIRoute`)
- https://docs.astro.build/en/basics/astro-pages/ (커스텀 404 페이지)
- https://docs.astro.build/en/reference/routing-reference/ (라우트 우선순위에서 endpoint의 자리)
- 문서에 없어 직접 확인한 것: 정적 빌드에서 `Content-Type` 헤더가 버려진다, `directory` 포맷에서 404의 출력 경로, dev와 preview에서 `/404`의 상태 코드.
