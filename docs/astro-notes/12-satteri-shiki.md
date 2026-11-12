# 12. Sätteri와 Shiki: 기본 마크다운 엔진으로 옮기기

## 한 줄 요약

`config/markdown.mjs`를 `unified()` + rehype-highlight에서 Astro 7의 기본 엔진 `satteri()` + Shiki(github-light·github-dark 듀얼 테마, CSS 변수)로 바꿨다. 수식은 Sätteri의 `math` 기능과 작은 mdast 플러그인(KaTeX)으로, 각주 문구는 `features.gfm.footnotes`로 되살렸고, 코드 블록 바깥의 화면은 배포본과 픽셀까지 같다.

## 개념

- **Sätteri 기능은 `features`로 켠다.** GFM(각주 포함)은 기본 켜짐, `math`와 `smartPunctuation`은 기본 꺼짐이다(`node_modules/satteri/dist/compile-types.d.ts`). 수식은 `$…$`를 `inlineMath` 노드로 읽기만 하고 그리지는 않는다.
- **mdast 플러그인**은 노드 종류별 방문 함수를 가진 객체다: `{ name, inlineMath(node, ctx) { ctx.replaceNode(node, { type: "html", value }) } }`. `html` 노드는 그대로 출력되므로 `katex.renderToString` 결과를 넣으면 rehype-katex와 같은 HTML이 된다.
- **Shiki 듀얼 테마**: `shikiConfig.themes: { light, dark }` + `defaultColor: false`면 토큰마다 `style="--shiki-light:#D73A49;--shiki-dark:#F97583"`만 붙고 실제 `color`는 없다. 어느 변수를 쓸지는 내 CSS(`src/styles/code.css`)가 `.astro-code, .astro-code span`에서 고른다. 다크 모드는 같은 선택자에 `--shiki-dark*`를 쓰는 규칙 하나를 더하면 된다.
- **Shiki 트랜스포머**: `shikiConfig.transformers`의 `code(node)` 훅에서 `this.addClassToHast(node, …)`로 `<code>`에 클래스를 붙인다. `this.options.lang`이 언어이고, 언어 없는 블록은 `plaintext`다.
- **CSS가 기대는 클래스가 사라질 수 있다.** 코드 글꼴은 global.css의 `code[class*="language-"]`가 정하는데 Shiki는 `<code>`에 클래스를 붙이지 않는다(`<pre data-language>`만). 그래서 트랜스포머로 `language-<lang>`을 되살렸다.

## Next.js 대응

| 예전 (배포본, S2.2까지)                                                      | 지금 (S4.1)                                                                  |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `unified({ gfm, smartypants: false, remarkPlugins: [remarkMath] })`          | `satteri({ features: { gfm, math: true, smartPunctuation: false } })`        |
| `rehypeKatex`                                                                | mdast 플러그인 `katex`(`inlineMath`, `math` → `katex.renderToString`)        |
| `remarkRehype: { footnoteBackLabel: "Back to content" }`                     | `features.gfm.footnotes.backLabel: "Back to content"`                        |
| `rehypeHighlight` + highlight.js 11.5.1 문법 35개, `detect: true`            | `syntaxHighlight: "shiki"`, `shikiConfig.themes`(github-light / github-dark) |
| `import "highlight.js/styles/base16/monokai.css"`(글 페이지)                 | `import "../../styles/code.css"`(CSS 변수 고르기 + 예전과 같은 상자)         |
| `pre code.hljs { display:block; overflow-x:auto; padding:1em }`              | `.astro-code > code`에 같은 값                                               |
| 의존성 `@astrojs/markdown-remark`, `rehype-*`, `remark-math`, `highlight.js` | `@astrojs/markdown-satteri`, `katex`                                         |

## 빌드 결과물에서 확인하기

- `dist/posts/ts-ambient-type-declaration.html`: `<pre class="astro-code astro-code-themes github-light github-dark" style="--shiki-light:#24292e;…" data-language="ts"><code class="language-ts"><span class="line">…`.
- `grep -o 'class="astro-code' dist/posts/*.html | wc -l` → 71(예전 `hljs` 블록 수와 같다).
- `grep -o 'class="katex"' dist/posts/*.html | wc -l` → 121(배포본과 같다).
- `dist/posts/proxy-to-built-in-objects.html`: 언어 없는 블록이 `data-language="plaintext"`, `<code class="language-plaintext">`, 토큰 색 없이 글자만 있다.
- 각주: `aria-label="Back to content"`.
- `npm run verify` 전체 통과. `visual`은 `scripts/verify/accepted/s4-1-shiki.json`의 `mask: ["pre"]`(글 라우트)로 코드 블록만 가리고 비교한다.

## 닫힌 고리가 잡아낸 것

- **Red**: Shiki로 바꾸자 `visual` 12/84. 72개 모두 **페이지 높이**가 달랐다(-10 ~ -40px). 높이가 다르면 mask로 가려도 그 아래가 밀려 실패한다.
- **가설 1(실패)**: 여백 위치. 처음엔 `padding: 1em`을 `<pre>`에 줬다. `<code>`로 옮겨 예전 상자와 같게 했지만 높이 차이는 그대로였다.
- **원인**: 스크린샷을 보니 코드 글꼴이 Source Code Pro가 아니라 기본 고정폭이었다. global.css의 `code[class*="language-"]`가 Shiki 출력의 `<code>`에 걸리지 않았다(클래스 없음). 트랜스포머로 `language-<lang>`을 붙이자 높이가 같아지고, 남은 차이는 `pre` 안의 색뿐이었다.
- **언어 없는 블록**: 예전에는 rehype-highlight가 자동 감지해 `language-javascript`를 붙여 같은 글꼴을 받았다. 이제는 `language-plaintext`가 되어 글꼴과 상자는 같고 색만 없다.
- `content`는 처음부터 14/14였다: Sätteri가 내는 각주·표·raw HTML의 텍스트가 unified와 같았다.

## 직접 해볼 실험

끝나면 `git checkout config/markdown.mjs src/styles/code.css`로 되돌린다.

1. `config/markdown.mjs`에서 `transformers: [languageClass],` 줄을 지우고 `npm run -s verify -- --only=visual --no-check --route=/posts/css-masters-2-week1`.
   <details><summary>예상 결과</summary>`FAIL visual 0/6`, 1280에서 `height 5241 ≠ 5224 (-17)`. 코드가 Source Code Pro 대신 브라우저 기본 고정폭으로 나와 줄 높이가 달라진다.</details>
2. `math: true,`를 지우고 `npm run -s verify -- --only=content --no-check --route=/posts/how-to-check-two-types-are-equal-in-ts`.
   <details><summary>예상 결과</summary>`FAIL content`. `$A$`가 글자 그대로 남고 `grep -o 'class="katex"' dist/posts/*.html | wc -l`은 0이다.</details>
3. `src/styles/code.css`에서 `--shiki-light`를 모두 `--shiki-dark`로 바꾸고(`-bg` 등 포함) 개발 서버에서 글 하나를 연다.
   <details><summary>예상 결과</summary>코드 블록만 github-dark(배경 #24292e)로 바뀐다. HTML은 그대로이므로 다크 모드는 CSS 규칙 하나로 켤 수 있다.</details>

## 문서 근거

- https://docs.astro.build/en/guides/markdown-content/ (`markdown.processor`, Sätteri `features.gfm.footnotes`, `smartPunctuation`, `mdastPlugins`)
- https://docs.astro.build/en/guides/syntax-highlighting/ (`shikiConfig.themes`, `.astro-code`, `--shiki-dark` 변수, 트랜스포머)
- https://docs.astro.build/en/reference/configuration-reference/ (`markdown.syntaxHighlight`의 기본 `excludeLangs: ['math']`)
- https://shiki.style/guide/dual-themes (`defaultColor: false`와 CSS 변수)
- 문서에 없어 직접 확인한 것: Sätteri의 `math` 기본값과 mdast 방문 함수 이름(`satteri` 패키지 타입 선언), `defaultColor: false`일 때 Shiki가 `<code>`에 클래스를 붙이지 않는다는 것(빌드 결과물). 요약: `docs/astro-notes/_refs/markdown-shiki.md`.
