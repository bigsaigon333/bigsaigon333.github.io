# 20. MDX: `.mdx` 초안에서 컴포넌트 쓰기

## 한 줄 요약

`@astrojs/mdx`를 `integrations`에 넣고 컬렉션 glob을 `*.{md,mdx}`로 넓혔다. `.mdx`는 `markdown.processor`(Sätteri)를 물려받지만 KaTeX 플러그인이 넣는 `html` 노드를 컴파일하지 못해서, 같은 옵션으로 만든 MDX 전용 Sätteri 처리기를 `mdx({ processor })`로 따로 넘겼다. `.md` 빌드 결과는 바이트까지 같다.

## 개념

- **통합(integration)**: `astro.config.mjs`의 `integrations: [mdx()]`. `.mdx`를 Vite 모듈로 컴파일하고 콘텐츠 컬렉션에 `.mdx` 엔트리 타입을 등록한다.
- **설정 상속**: `extendMarkdownConfig`(기본 `true`)면 `markdown.*`(Shiki 설정 포함)과 `markdown.processor`를 그대로 쓴다. `mdx({ processor })`를 주면 처리기만 바뀌고 나머지 상속은 유지된다.
- **MDX는 결과가 JSX다.** `.md`에서는 불투명한 raw HTML 노드가 그대로 출력되지만, MDX 컴파일러(mdxjs-rs)는 그런 노드를 JSX로 만들 수 없어 `MDXError ... (mdxjs-rs:raw-html)`로 멈춘다. Sätteri 플러그인이 `{ raw: html, mdxExpressions: false }`를 돌려주면 그 HTML을 JSX로 파싱한다(`{`는 식으로 읽지 않음).
- **컬렉션 로더**: `glob({ pattern: "*.{md,mdx}" })`. `generateId`가 확장자를 떼므로 `/\.mdx?$/`로 넓혀야 주소가 `/posts/mdx-demo`가 된다.
- **컴포넌트**: `.mdx` 맨 위에서 `import Callout from "…/Callout.astro"` 후 `<Callout type="tip">**Markdown**</Callout>`. `export const answer = 42` 후 `{answer}`처럼 JS 식도 쓴다.

## Next.js 대응

| Next.js                                                       | Astro (S5.5)                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `@next/mdx` + `next.config.js`의 `withMDX`, `pageExtensions`  | `integrations: [mdx()]`, 컬렉션 glob `*.{md,mdx}`                     |
| `mdx-components.tsx`의 전역 컴포넌트 매핑                     | `.mdx` 안의 `import`, 또는 `<Content components={{ … }} />`           |
| remark/rehype 플러그인을 `withMDX({ options })`에 따로 넣는다 | `markdown.processor` 상속. 여기서는 html 노드 때문에 처리기를 따로 줌 |
| 클라이언트 컴포넌트는 기본 하이드레이션                       | `.astro` 컴포넌트는 JS 0. 프레임워크 컴포넌트만 `client:*`            |

## 빌드 결과물에서 확인하기

- 운영 빌드: `mdx-demo`는 `posts/draft/` 초안이라 `dist/posts/`에 없다. 변경 전(d638336) 설정으로 다시 빌드한 `dist/`와 `diff -r` → 차이 없음.
- `npm run verify` ALL PASS 16/16, accept 파일 없음.
- `astro dev --background` 후 `/posts/mdx-demo`: 200. `<aside class="callout tip" aria-label="컴포넌트">`, `답은 42 이다`, `class="katex"` 2개(인라인·블록, `<math>` 포함), `<pre class="astro-code … github-light-high-contrast …" data-language="ts">` + `<code class="language-ts">`, `aria-label="Back to content"` 1개. `.callout`에 axe 위반 0(color-contrast 통과).

## 닫힌 고리가 잡아낸 것

- **가설 1(실패)**: "MDX는 Sätteri 설정을 물려받으니 `mdx()`만 넣으면 된다." 빌드와 verify는 통과했지만(초안은 운영 빌드에 없다) dev에서 `/posts/mdx-demo`가 500. 로그: `Cannot compile a raw node (raw HTML) to MDX/JSX output. A plugin returned an html node`. 상속은 되었고, 그래서 깨졌다: 상속된 KaTeX 플러그인이 원인.
- **해결**: `.md` 처리기는 그대로 두고(바이트 동일 유지), 같은 `features`와 플러그인으로 MDX용 `satteri()`를 만들되 플러그인의 `ctx.replaceNode`를 Proxy로 감싸 `html` 노드를 `{ raw, mdxExpressions: false }`로 바꿨다. Shiki·각주·GFM은 손대지 않아도 상속으로 같게 나왔다.
- 운영 빌드만 보는 verify로는 이 실패를 볼 수 없다. 초안 전용 기능은 dev 스모크 테스트가 필요하다.

## 직접 해볼 실험

끝나면 `git checkout astro.config.mjs src/content.config.ts`로 되돌린다.

1. `astro.config.mjs`에서 `mdx({ processor: mdxProcessor })`를 `mdx()`로 바꾸고 `npx astro dev --background`, `curl -s -o /dev/null -w "%{http_code}" localhost:4321/posts/mdx-demo`, `npx astro dev logs`, `npx astro dev stop`.
   <details><summary>예상 결과</summary>500. 로그에 `MDXError: Cannot compile a raw node (raw HTML) to MDX/JSX output ... (mdxjs-rs:raw-html)`. 수식 없는 `.mdx`라면 통과한다.</details>
2. `src/content.config.ts`의 `generateId`를 `/\.md$/`로 되돌리고 같은 방법으로 `/posts/mdx-demo`와 `/posts/mdx-demo.mdx`를 연다.
   <details><summary>예상 결과</summary>id가 확장자를 단 `mdx-demo.mdx`가 되어 `/posts/mdx-demo`는 404, 홈 목록의 링크도 `.mdx`로 끝난다.</details>
3. `posts/draft/mdx-demo.mdx` 본문에 이스케이프 없이 `a < b {c}`를 쓰고 dev에서 연다.
   <details><summary>예상 결과</summary>MDX 구문 오류(또는 `c is not defined`). `.md`와 달리 `<`, `{`는 JSX 문법이라 `\{`, `&lt;`로 써야 한다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/integrations-guide/mdx/ (설치, `extendMarkdownConfig`, `processor` 상속, 컴포넌트 import, glob `**/*.{md,mdx}`)
- https://docs.astro.build/en/guides/integrations/ (`integrations` 배열)
- 문서에 없어 직접 확인한 것: MDX가 `html` 노드를 거부하고 `{ raw, mdxExpressions: false }`를 받는다는 것(오류 문구와 `node_modules/satteri/dist/command-buffer.d.ts`), 처리기 결정 순서(`node_modules/@astrojs/mdx/dist/index.js`의 `astro:config:done`). 요약: `docs/astro-notes/_refs/mdx.md`.
