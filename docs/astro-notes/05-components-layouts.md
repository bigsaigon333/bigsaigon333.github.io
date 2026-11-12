# 05. 컴포넌트, props, 레이아웃, slot, head 태그

## 한 줄 요약

`<Head>`를 페이지마다 복사하던 메타 15줄은 `src/components/Seo.astro` 하나가 되고, `components/layout.tsx`의 `{children}`은 `src/layouts/BaseLayout.astro`의 `<slot />`이 됐다. 홈과 글 12개의 head가 배포본과 같다(`head 13/13`, `/404`는 허용한 차이).

## 개념

- **컴포넌트 = 펜스 + 템플릿.** `---` 사이는 빌드 때 Node에서 도는 TypeScript이고 아래는 HTML이다. state도 effect도 없다. `Footer.astro`처럼 펜스가 아예 없어도 컴포넌트다.
- **props**: 펜스에서 `interface Props`를 선언하고 `Astro.props`에서 꺼낸다(`const { home = false } = Astro.props`). `Props`라는 이름이 약속이라서 `astro check`가 호출하는 쪽을 검사한다. 다른 파일에서 타입이 필요하면 `export interface Props`로 내보낸다(`BaseLayout`이 `Seo`의 `Props`를 `seo`의 타입으로 쓴다). `<Seo {...seo} />`처럼 펼쳐 넘길 수도 있다.
- **템플릿은 JSX와 닮았지만 HTML이다.** 속성 이름은 HTML 그대로다: `class`, `srcset`, `referrerpolicy`, `datetime`. 조건부 렌더링과 반복은 JSX와 같은 `{home && (…)}`, `{href ? (…) : (…)}`, `{posts.map(…)}`이고 `key`는 필요 없다.
- **`<slot />`** 은 자식이 들어갈 자리다. `BaseLayout`은 `<div class="layout"><Header /><slot /><Footer /></div>`이고, 페이지가 `<BaseLayout>` 안에 쓴 것이 `<slot />` 자리에 들어간다.
- **head는 그냥 템플릿이다.** `next/head`처럼 트리 어디서나 head로 끌어올려 주고 중복을 합쳐 주는 장치가 없다. `<head>`를 레이아웃에 직접 쓰고, 그 안에 놓은 컴포넌트(`Seo`, `HeadAssets`, `Analytics`)가 낸 태그가 적힌 순서대로 한 번씩 나온다. 같은 태그를 두 곳에 쓰면 두 번 나온다.
- **속성 값에 따라 출력이 달라진다.** `undefined`와 `false`는 속성을 통째로 빼고, 빈 문자열은 값 없는 속성으로 낸다(`content=""`가 아니라 `content`). HTML 파서는 둘을 같은 빈 문자열로 읽는다.
- **v7의 `compressHTML: "jsx"`** 덕분에 `Header.astro`에서 `<span>`, `<br />`, `<span>`을 세 줄로 써도 사이에 공백이 생기지 않는다. React가 내던 것과 같다.

## Next.js 대응

| 예전 (`git show main:<경로>`)                                                      | 지금                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `components/layout.tsx`의 `<Body><Header home={home} />{children}<Footer>…`        | `src/layouts/BaseLayout.astro`의 `<div class="layout"><Header home={home} /><slot />…`   |
| `components/header.tsx` (`<Link href="/" passHref legacyBehavior><A>`)             | `src/components/Header.astro` (`<a href="/">`)                                           |
| `components/layout.style.ts`의 `Footer`                                            | `src/components/Footer.astro`                                                            |
| `pages/index.page.tsx`, `pages/posts/[id].page.tsx`에 각각 있던 `<Head>` 메타 15줄 | `src/components/Seo.astro` 하나. 페이지는 `seo={{ title, description, url, type, … }}`만 |
| `pages/_document.page.tsx`의 `<link rel="icon">`, `google-site-verification`       | `BaseLayout.astro`의 `<head>` (`SITE.googleSiteVerification`)                            |
| `pages/_app.page.tsx`의 viewport 메타                                              | `BaseLayout.astro`의 `<head>`                                                            |
| `pages/index.style.ts`의 `Article`을 홈과 글 페이지가 함께 import                  | `src/components/PostHeader.astro`를 함께 쓴다. `href`를 주면 제목이 링크가 된다(홈 목록) |
| `srcSet`, `referrerPolicy`, `dateTime`, `className`                                | `srcset`, `referrerpolicy`, `datetime`, `class`                                          |
| 메일 주소와 깃허브 주소가 `header.tsx`에 문자열로                                  | `src/lib/site.ts`의 `SITE.email`, `SITE.github`                                          |

## 빌드 결과물에서 확인하기

- `dist/index.html`의 `<head>`: charset, viewport, `<title>`, description, author, keywords, canonical, `og:*` 5개, `twitter:*` 4개, icon, google-site-verification 순서로 18개다. 앞의 16개가 배포본의 `<meta name="next-head-count" content="16">`이 세던 것이다.
- `<body><div class="layout"><header>…</header><section>…</section><footer>…</footer></div></body>`. 글 페이지는 `<section>` 자리에 `<article>…</article><main>…</main>`이 온다.
- `grep -c link-list dist/index.html` → 1, `grep -c link-list dist/posts/*.html` → 전부 0. 아이콘 링크는 홈에만 있다.
- `grep -o '<meta name="description"[^>]*>' dist/posts/css-masters-2-week2.html` → `<meta name="description" content>`. description이 없는 글 9개가 이렇게 나온다. 배포본은 `content=""`다.
- 홈의 keywords는 `"김동희, 프론트엔드, …"`이고 배포본은 `"김동희,프론트엔드,…"`다. `head` 검사는 keywords를 쉼표로 나눈 목록으로 비교한다.

## 닫힌 고리가 잡아낸 것

- 구현은 첫 실행에서 통과했다. Red는 `head 0/13`(description, author, canonical, `og:*`, `twitter:*`, icon, google-site-verification이 전부 `(none)`), 구현 뒤 `head 13/13`이다. `content`는 시작과 같은 `8/13`이고(실패 5개는 S2.2가 고치는 Markdown 차이) `/`는 통과한다.
- **중복 태그를 잡는지 일부러 확인했다.** `BaseLayout.astro`에 `<link rel="icon">`을 한 줄 더 넣으면 `FAIL head 0/1 /: icon: "/favicon.ico" → "/favicon.ico" + "/favicon.ico"`가 나온다. `HeadAssets.astro`(S2.3)가 파비콘을 또 넣으면 통합본에서 이 실패가 난다. 한쪽만 남겨야 한다.
- **빈 `content`**: 위의 `content`(값 없음)는 검사가 통과시킨다. cheerio가 `""`로 읽기 때문이고 브라우저와 크롤러의 HTML 파서도 그렇게 읽는다.

## 직접 해볼 실험

1. `src/pages/index.astro`의 `<BaseLayout … home>`에서 `home`을 지우고 `npm run build && grep -c link-list dist/index.html`.
   <details><summary>예상 결과</summary>`0`. `Header`의 `{home && (…)}`가 `false`가 되어 `<ul class="link-list">`가 통째로 빠지고 `<header>` 안에는 `<h1>`만 남는다. 빌드는 성공한다.</details>
2. `src/pages/index.astro`의 `seo`에서 `type: "website",` 줄을 지우고 `npm run check`, 이어서 `npm run build && grep -o '<meta property="og:type"[^>]*>' dist/index.html`.
   <details><summary>예상 결과</summary>`check`는 `src/pages/index.astro:11:3 - error ts(2741): Property 'type' is missing in type '{ … }' but required in type 'Props'.`로 실패한다. `build`는 성공하고 `<meta property="og:type">`이 나온다(`undefined`라서 `content` 속성이 빠졌다). props 타입은 `astro check`만 지킨다.</details>
3. `src/components/Footer.astro`에서 `</footer>`를 지우고 `npm run build`.
   <details><summary>예상 결과</summary>`[CompilerError] Unexpected token`과 `Location: …/src/components/Footer.astro:2:0`으로 빌드가 멈춘다. v7의 Rust 컴파일러는 닫지 않은 태그를 고쳐 주지 않는다.</details>

## 문서 근거

- https://docs.astro.build/en/basics/astro-components/ (펜스, `Astro.props`, `interface Props`, slot)
- https://docs.astro.build/en/basics/layouts/ (`<html>`과 `<head>`를 레이아웃에 쓴다)
- https://docs.astro.build/en/guides/upgrade-to/v7/ (`compressHTML: "jsx"`, 닫지 않은 태그는 오류)
- 문서에 없어 직접 확인한 것: 빈 문자열 속성이 `content`로 나오는 것, `undefined` 속성이 빠지는 것, props가 빠져도 빌드는 성공하는 것, 닫지 않은 태그의 오류 메시지.
