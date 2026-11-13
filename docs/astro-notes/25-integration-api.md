# 25. Integration API: `astro:build:done`으로 링크·JS 예산 지키기

## 한 줄 요약

`integrations/site-guard.mjs`는 `{ name, hooks }`를 돌려주는 로컬 통합이다. `astro:build:done`에서 `dist`의 HTML 31장을 훑어 내부 `href`·`src`·`srcset`이 GitHub Pages 방식으로 파일에 풀리는지, 페이지당 JS 바이트가 `jsBudget`(32KiB) 이하인지 본다. 어기면 `logger.error`로 위반을 하나씩 적고 Error를 던져 `astro build`를 1로 끝낸다. 검사에 12ms가 든다.

## 개념

- **통합의 모양**: 옵션을 받아 `{ name: "site-guard", hooks: { … } }`를 돌려주는 함수. `config/integrations.mjs`가 `[siteGuard({ jsBudget })]`를 내보내고 `astro.config.mjs`가 `integrations: [mdx(…), ...localIntegrations]`로 펼친다. 훅은 배열 순서대로 돈다.
- **훅 두 개**: `astro:config:done`에서 확정된 `config.site`·`config.base`를 기억하고(`config:setup`의 `config`는 다른 통합이 고치기 전 사본이다), `astro:build:done`의 `dir`(URL)을 `fileURLToPath`로 바꿔 읽는다. `pages`는 쓰지 않는다. 404처럼 목록 밖의 HTML까지 보려고 `dir`을 직접 돈다.
- **GitHub Pages 풀이**: `/p/` → `p/index.html`, `/p` → `p`(파일) → `p.html` → `p/index.html`. 경로는 `decodeURIComponent`로 풀어 `/tags/void-%EC%9A%94%EC%86%8C`가 `tags/void-요소.html`에 닿는다. 사이트 주소로 시작하는 절대 URL(`og:image`의 `content`, RSS `<link>`)도 내부로 친다.
- **JS 예산**: 인라인 `<script>`(JSON·JSON-LD 제외) + 내부 `script[src]`·`modulepreload` + 그 파일이 정적으로 import하는 내부 파일(전이적, 파일당 한 번). gtag·utterances는 바이트를 모르니 세지 않는다. verify의 `budget`(기준선과 비교)과 달리 절대 상한이다.
- **빌드 실패시키기**: 문서에 "훅이 빌드를 멈추는 법"은 없다. Astro는 훅의 예외를 `An unhandled error occurred while running the "astro:build:done" hook`으로 감싸 다시 던진다(`hooks.js`의 `withTakingALongTimeMsg`). `logger.error`만으로는 빌드가 성공한다. 그래서 적고 나서 던진다.
- **logger**: 훅 인자의 `logger`가 `[site-guard]` 꼬리표를 단다. import가 필요 없다.

## Next.js 대응

| Next.js                                    | Astro (S7.3)                                       |
| ------------------------------------------ | -------------------------------------------------- |
| `next.config.js`의 `webpack()`·플러그인    | `integrations: [{ name, hooks }]`                  |
| `next build` 뒤 별도 스크립트(`postbuild`) | `astro:build:done` 훅: 빌드 안에서, 같은 로그 체계 |
| `experimental.typedRoutes`(링크 타입 검사) | 없음. 결과물 `dist`를 읽어 링크를 확인한다         |
| `performance.maxAssetSize`(webpack 경고)   | 직접 센 페이지당 바이트 + Error로 실패             |

## 빌드 결과물에서 확인하기

- `npm run build`의 끝: `[site-guard] 페이지 31장, 내부 참조 665개 모두 풀림, 페이지당 JS ≤ 32768바이트 (12ms)`. 빌드 전체 약 4초에 12ms가 더해진다(1초 기준의 1% 남짓).
- 바이트(예산을 1000으로 줄여 본 값): 글 페이지 12장 21005바이트, 나머지 19 페이지 19714바이트. 파일은 모두 3개(ClientRouter, page, prefetch), 인라인은 글이 5개·나머지가 3개.
- 검사는 `dist`를 읽기만 한다. 결과물이 그대로라 verify의 parity 검사는 새 차이가 없다.

## 닫힌 고리가 잡아낸 것

- Red 0: 통합 없이 `Seo.astro`의 `/sitemap.xml`을 `/sitemapp.xml`로 바꿔도 `astro build`는 0으로 끝났다. 지금은 아무것도 깨진 링크를 막지 않는다는 것을 먼저 확인했다.
- Red 1: 같은 변경에 통합을 켜면 1로 끝나고 `[ERROR] [site-guard] 깨진 링크 /404: <link href="/sitemapp.xml"> → /sitemapp.xml 에 해당하는 파일이 없다`가 31줄, 이어서 `site-guard: 깨진 링크 31개, JS 예산 초과 0페이지`.
- Red 2: `jsBudget: 1000`이면 1로 끝나고 `JS 예산 초과 /: JS 19714바이트 > 예산 1000바이트 (파일 3개 + 인라인 3개)`가 31줄.
- 처음 생각은 `content` 속성을 다 보는 것이었지만 `content="true"`·설명문까지 상대 URL로 풀린다. 사이트 주소로 시작할 때만 본다.
- HTML 파서(cheerio)는 devDependency라 빌드 경로에 들이지 않았다. `<script>`·`<style>`·주석 본문을 지운 뒤 태그 안의 속성만 정규식으로 읽는다. 본문 글자는 `&lt;`로 이스케이프되어 코드 블록 속 `<a href>`가 잡히지 않는다.

## 직접 해볼 실험

끝나면 `git checkout src config`로 되돌린다.

1. `src/components/Header.astro`의 `href="/"`를 `href="/home"`으로 바꾸고 `npm run build; echo $?`.
   <details><summary>예상 결과</summary>모든 페이지에서 `깨진 링크 …: <a href="/home"> → /home 에 해당하는 파일이 없다`, 종료 코드 1. `/home`, `home.html`, `home/index.html` 어느 것도 없다. `href="/tags"`로 바꾸면 `tags.html`로 풀려 통과한다.</details>
2. `config/integrations.mjs`의 `jsBudget`을 `20000`으로 줄이고 빌드.
   <details><summary>예상 결과</summary>글 페이지 12장만 `JS 21005바이트 > 예산 20000바이트`로 실패한다. 다른 페이지는 19714바이트라 통과. 차이 1291바이트는 글에만 있는 인라인 모듈 둘(`<toc-spy>` 621, `<copy-code>` 670)이다.</details>
3. 훅에서 `throw`를 지우고(로그만 남기고) 실험 1을 다시 한다.
   <details><summary>예상 결과</summary>`[ERROR]` 줄은 그대로 나오지만 종료 코드는 0이다. logger는 빌드를 멈추지 않는다.</details>

## 문서 근거

- https://docs.astro.build/en/reference/integrations-reference/ (`AstroIntegration`, `astro:config:done`, `astro:build:done`의 `dir`·`pages`·`logger`)
- https://docs.astro.build/en/reference/logger-reference/ (`AstroIntegrationLogger`, 수준)
- https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site (Pages가 `.html`·`index.html`을 찾는 방식)
