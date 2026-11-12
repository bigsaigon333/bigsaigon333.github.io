# 03. 동적 라우트: getStaticPaths와 render()

## 한 줄 요약

`src/pages/posts/[id].astro` 한 파일이 `getStaticPaths()`가 돌려준 12개의 `{ params, props }`만큼 `dist/posts/<id>.html`을 찍어 내고, 본문은 `render(post)`가 준 `<Content />`로 넣는다.

## 개념

- **파일 이름의 `[id]`가 파라미터다.** 정적 출력에서는 `getStaticPaths()`가 필수이고, 빌드 때 한 번 실행되어 만들 페이지의 목록을 돌려준다. 목록에 없는 경로는 아예 만들어지지 않는다(Next의 `fallback: false`가 기본이자 유일한 동작).
- **`params`는 URL, `props`는 데이터.** `params.id`는 문자열이어야 하고 파일 이름이 된다. `props`에는 무엇이든 실을 수 있어서 컬렉션 엔트리(`post`)를 통째로 넘긴다. Next처럼 "경로 목록 → id로 다시 조회"의 두 단계가 아니다.
- **타입**: `satisfies GetStaticPaths`로 반환값을 검사하고 `type Props = InferGetStaticPropsType<typeof getStaticPaths>`로 `Astro.props.post`의 타입을 끌어온다.
- **`render(post)`**: 엔트리의 Markdown을 컴포넌트로 돌려준다(`{ Content, headings }`). HTML은 이미 `Syncing content` 단계에서 만들어져 스토어에 있고, `<Content />`는 그것을 그 자리에 넣는다. `dangerouslySetInnerHTML`이 필요 없다.
- **`build.format: "file"`의 함정**: 이 페이지 안에서 `Astro.url.pathname`은 `/posts/<id>.html`이다. 그래서 canonical로 쓸 주소는 `postUrl(post.id)`(`src/lib/posts.ts`)로 id에서 조립한다.
- **`<title>`은 글 제목 그대로다.** utterances가 `issue-term="title"`로 댓글 이슈를 찾으므로 사이트 이름 같은 것을 붙이면 기존 댓글이 사라진다.
- 본문 HTML은 `config/markdown.mjs`가 설정한 unified 체인(remark-math, rehype-katex, rehype-highlight, 04)이 만든다. `render()`는 그 결과를 꺼내 줄 뿐이다.

## Next.js 대응

| 예전 (`git show "main:pages/posts/[id].page.tsx"`, `main:lib/posts.ts`) | 지금                                                                                     |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pages/posts/[id].page.tsx`                                             | `src/pages/posts/[id].astro`                                                             |
| `getStaticPaths` → `{ paths: getAllPostIds(), fallback: false }`        | `getStaticPaths` → `posts.map((post) => ({ params: { id: post.id }, props: { post } }))` |
| `getStaticProps({ params })` → `getPostData(params.id)`                 | 없다. `props`로 이미 받았다                                                              |
| `getPostData`의 unified 체인(`remarkParse` … `rehypeStringify`)         | `render(post)` + `config/markdown.mjs`                                                   |
| `<Main dangerouslySetInnerHTML={{ __html: contentHtml }} />`            | `<main class="prose"><Content /></main>`                                                 |
| `<Article><h2>…</h2><time …></Article>` (styled-components)             | `src/components/PostHeader.astro`                                                        |
| `useEffect`로 `<div ref>`를 utterances 스크립트로 교체                  | `src/components/Comments.astro`의 정적 `<script is:inline>` (07)                         |
| `` const url = `https://bigsaigon333.github.io/posts/${id}` ``          | `postUrl(post.id)`                                                                       |

## 빌드 결과물에서 확인하기

- `ls dist/posts` → `.html` 12개. 빌드 로그의 `generating static routes`에 `/posts/<id>.html`이 날짜 내림차순(`getPublishedPosts()`의 순서)으로 찍힌다.
- `dist/posts/ts-ambient-type-declaration.html`: `…</header><article …><h2 …>Ambient Type Declaration</h2><time datetime="2022-05-07T00:00:00.000Z" …>2022-05-07</time></article><main class="prose"><p>…`(`…`는 `data-astro-cid-…` 속성). `<title>`, `article h2`, `time`이 배포본 `.verify/baseline/posts/` 12개와 모두 같다.
- 배포본과 다른 곳은 본문 제목의 `id`뿐이다(`<h2 id="i-앰비언트-타입-선언">`, 배포본은 `<h2>`). 코드 블록은 배포본과 같은 `<pre><code class="hljs language-ts">`다(04).
- `dist/`에 Astro가 묶어 낸 JS·CSS 파일(`_astro/`)은 없다.

## 닫힌 고리가 잡아낸 것

- 이 단계의 구현은 첫 실행에서 통과했다. Red는 예상대로 `ROUTES FAIL`(missing 12), `POSTS FAIL 0/12`였고 구현 뒤 `ROUTES PASS 14`, `POSTS PASS 12/12`가 됐다.
- **두 시간대 빌드**: 14개 페이지의 `<time>` 24개가 `TZ=Asia/Seoul`과 `TZ=America/Los_Angeles`에서 같다. `dist/` 전체도 바이트 단위로 같았다.
- **`Astro.url`로 canonical을 만들면 안 되는 이유를 확인**: 글 페이지에 `{Astro.url.pathname}`을 찍어 보니 `/posts/ts-ambient-type-declaration.html`이었다. 배포본의 canonical에는 `.html`이 없다.

## 직접 해볼 실험

1. `[id].astro`의 `<Comments />` 위에 `<pre>{Astro.url.pathname} / {Astro.params.id}</pre>`를 넣고 빌드한 뒤 `dist/posts/regular-expression-1.html`의 끝부분을 본다.
   <details><summary>예상 결과</summary>`/posts/regular-expression-1.html / regular-expression-1`. `astro.config.mjs`에서 `build.format`을 지우면 `/posts/regular-expression-1`로 바뀐다(파일은 `dist/posts/regular-expression-1/index.html`).</details>
2. `getStaticPaths`의 `posts.map(`을 `posts.slice(0, 3).map(`으로 바꾸고 빌드한다.
   <details><summary>예상 결과</summary>`5 page(s) built`(엔드포인트 `/sitemap.xml`은 세지 않는다). `dist/posts`에 최신 글 3개만 남는다. 홈과 `sitemap.xml`은 여전히 12개를 실으므로 나머지 9개는 깨진 링크가 된다. 경로 목록과 링크 목록은 따로 관리된다는 뜻이다.</details>
3. `const { Content } = await render(post);`를 `const { Content, headings } = …`로 바꾸고 `<Comments />` 위에 `<pre>{JSON.stringify(headings, null, 2)}</pre>`를 찍은 뒤 `dist/posts/ts-ambient-type-declaration.html`의 끝부분을 본다.
   <details><summary>예상 결과</summary>`{ depth, slug, text }` 배열이 나온다. 예: `{"depth": 2, "slug": "i-앰비언트-타입-선언", "text": "I. 앰비언트 타입 선언"}`. 파일 안에서는 `"`가 `&quot;`로 이스케이프되어 있다(`{…}` 표현식은 HTML 이스케이프된다). S5.3(계획)의 목차를 이것으로 만든다.</details>
4. `[id].astro`에서 `getStaticPaths`를 통째로 지우고 빌드한다.
   <details><summary>예상 결과</summary>`` [GetStaticPathsRequired] `getStaticPaths()` function is required for dynamic routes. ``와 `Location: src/pages/posts/[id].astro:0:0`으로 실패한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/routing/ (동적 라우트, 우선순위)
- https://docs.astro.build/en/reference/routing-reference/ (`getStaticPaths()`, `params`, `props`)
- https://docs.astro.build/en/reference/modules/astro-content/ (`render()`)
- https://docs.astro.build/en/guides/typescript/ (`InferGetStaticPropsType`)
- https://docs.astro.build/en/reference/configuration-reference/ (`build.format`과 `Astro.url`)
