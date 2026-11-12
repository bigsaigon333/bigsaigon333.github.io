# 16. 태그 페이지: 컬렉션에서 동적 라우트 파생

## 한 줄 요약

글 frontmatter 의 `keywords`를 태그로 삼아 `/tags`(태그와 글 수)와 `/tags/<슬러그>`(그 태그의 글, 날짜 내림차순, 홈과 같은 `PostHeader`)를 만들고, 글 머리 아래에 태그 링크 줄(`PostTags`)을 달았다. 한글은 슬러그에 그대로 두고 링크·canonical·sitemap 에서만 퍼센트 인코딩한다.

## 개념

- **동적 라우트는 컬렉션에서 파생한다.** `src/pages/tags/[tag].astro`의 `getStaticPaths`가 `getTags()`(`src/lib/tags.ts`)를 불러 `{ params: { tag: slug }, props: { tag } }`를 낸다. `getTags`는 `getVisiblePosts()`에서 출발하므로 운영 빌드에서는 초안의 키워드가 태그가 되지 않는다(dev 에서는 초안 글의 태그 링크가 깨지지 않게 섞인다).
- **슬러그 규칙**(`tagSlug`): NFKC → 소문자 → 글자(`\p{L}`)·숫자(`\p{N}`)·결합 부호(`\p{M}`)가 아닌 것의 연속을 `-` 하나로 → 앞뒤 `-` 제거. `void 요소` → `void-요소`, `built-in object` → `built-in-object`, `Proxy` → `proxy`, `요소vs태그` → 그대로. 같은 키워드면 늘 같은 슬러그(안정), 한글이 주소창에 그대로 보임(읽기 쉬움), 공백·`/`·`?`·`#`이 사라짐(URL 안전).
- **충돌은 빌드를 멈춘다.** 서로 다른 표기(NFC 비교)가 같은 슬러그가 되면(`CSS`/`css`, `C++`/`C#`) `getTags`가 던진다. 슬러그가 비는 키워드(구두점뿐)도 던진다. Astro 자체의 `prerenderConflictBehavior`는 기본 `'warn'`이라 기대지 않는다.
- **params 는 인코딩하지 않은 문자열로 준다.** Astro 는 그 문자열을 그대로 파일 이름으로 쓴다(`dist/tags/void-요소.html`). 링크는 `encodeURIComponent`한 `tagPath()`로 쓰고, GitHub Pages(와 `lib/resolve.mjs`)는 요청 경로를 디코드해 파일을 찾는다.
- `build.format: "file"`이라 `src/pages/tags/index.astro`는 `dist/tags.html`, 태그 페이지는 `dist/tags/*.html`이다. `/tags`는 디렉터리가 아니라 `tags.html`로 풀려 301 이 없다.

## Next.js 대응

| Next.js(예전 방식)                                           | Astro(S5.1)                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `pages/tags/[tag].tsx`의 `getStaticPaths` + `getStaticProps` | `src/pages/tags/[tag].astro`의 `getStaticPaths`가 `props`까지 낸다 |
| `fallback: false`                                            | 정적 빌드에서는 낸 경로만 생긴다(기본)                             |
| 슬러그 라이브러리(`slugify` 등)                              | 정규식 한 줄(`\p{L}\p{N}\p{M}` 유니코드 속성)                      |
| `next-sitemap`                                               | 직접 쓴 `src/pages/sitemap.xml.ts`에 태그 URL 을 더함              |

## 빌드 결과물에서 확인하기

- `ls dist/tags` → 16개, 그중 `void-요소.html`, `내부-슬롯.html` 같은 한글 파일 이름(NFC).
- `grep -o '<nav class="post-tags.*</nav>' dist/posts/css-masters-2-week1.html` → `href="/tags/%EC%9B%B9%ED%91%9C%EC%A4%80"` 처럼 인코딩된 링크, 글자는 `#웹표준`.
- `grep -c '/tags' dist/sitemap.xml` → 17(`/tags` + 태그 16개). loc 은 인코딩되어 있다.
- keywords 가 있는 발행 글은 2개뿐이라 태그는 모두 글 1편짜리다. 나머지 10개 글은 `PostTags`가 아무것도 그리지 않아 기준선과 픽셀까지 같다.
- 새 기능 검사 `tags`(`scripts/verify/checks/tags.mjs`): `posts/*.md`를 직접 읽어 계산한 태그별 글 집합과 각 태그 페이지가 링크하는 글 집합이 같은지, `/tags`의 글 수, 글 페이지의 태그 링크 집합과 200 응답을 본다. 기준선과의 차이는 `scripts/verify/accepted/s5-1-tags.json`(routes·sitemap 은 새 페이지, visual 은 태그 줄이 생긴 두 글, hover 는 `nav.post-tags` mask).

## 닫힌 고리가 잡아낸 것

- 문서(RR)는 params 가 "URL 로 인코딩된다"고만 하고 파일 이름이 어떻게 되는지 말하지 않는다. 빌드해 보니 인코딩 없이 한글 파일 이름이 나왔고, `links`·`listed`가 디코드해서 찾으므로 둘 다 통과했다.
- `hover`가 두 글에서 실패했다(링크 수 13 → 20). 라우트째 허용하지 않고 `mask: ["nav.post-tags"]`로 새 링크만 빼서, 기존 링크의 hover 스타일은 여전히 비교한다.
- `visual`은 태그 줄 높이만큼 아래가 밀려 mask 로 가릴 수 없다(높이 +59 ~ +94px). 두 글만 허용했다.
- `a11y`는 기준선 라우트만 돈다. 새 페이지(`/tags`, `/tags/css`, `/tags/내부-슬롯`)는 같은 axe 규칙(WCAG 2.1 A·AA)을 따로 돌려 위반 0을 확인했다. 태그 칩은 본문과 같은 글자색에 테두리만 더했다.
- 충돌 확인: `proxy-to-built-in-objects.md`의 keywords 에 `CSS`를 넣고 빌드하면 `태그 "CSS"(proxy-to-built-in-objects)와 "css"(css-masters-2-week1)가 같은 주소 /tags/css 가 된다`로 멈췄다(되돌림).

## 직접 해볼 실험

끝나면 `git checkout posts src`로 되돌린다.

1. `posts/proxy-to-built-in-objects.md`의 keywords 끝에 `, CSS`를 붙이고 `npm run build`.
   <details><summary>예상 결과</summary>빌드가 멈추고 `태그 "css"(css-masters-2-week1)와 "CSS"(proxy-to-built-in-objects)가 같은 주소 /tags/css 가 된다`(순서는 글 날짜 순). `CSS`를 `css`로 고치면 통과하고 `/tags/css`가 글 2편이 된다.</details>
2. `src/lib/tags.ts`의 `tagPath`에서 `encodeURIComponent`를 빼고 `npm run -s verify -- --feature --no-check --only=links,tags`.
   <details><summary>예상 결과</summary>둘 다 PASS. 링크가 `href="/tags/웹표준"`처럼 날글자가 되어도 브라우저와 GitHub Pages 가 인코딩해 요청하고, 서버가 디코드해 같은 파일을 찾는다. 그래도 인코딩해 두는 것은 HTML 을 다른 도구(복사, RSS 리더)가 읽을 때를 위해서다.</details>
3. `src/pages/tags/[tag].astro`의 `getTags()`를 `getCollection("posts")` 기반으로 바꿔 초안 필터를 빼 본다(최상위에 `draft: true`이고 keywords 가 있는 글을 하나 더한다).
   <details><summary>예상 결과</summary>`tags` 검사가 그 키워드의 태그 페이지를 "tag page for no keyword of a published post"로, 기존 태그 페이지에 초안이 섞였으면 `posts extra <id>`로 실패한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/routing/ (`getStaticPaths`, params 는 디코드되지 않음)
- https://docs.astro.build/en/reference/routing-reference/ (params 는 문자열, `props`)
- https://docs.astro.build/en/reference/configuration-reference/ (`build.format: "file"`, `prerenderConflictBehavior`)
- https://docs.astro.build/en/guides/content-collections/ (`getCollection` 필터, 순서는 직접 정렬)
- 문서에 없어 직접 확인한 것: 한글 params 가 인코딩 없이 파일 이름이 된다는 것(빌드 결과물). 요약: `docs/astro-notes/_refs/tags.md`.
