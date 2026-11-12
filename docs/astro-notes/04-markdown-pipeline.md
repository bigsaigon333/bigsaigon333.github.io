# 04. 마크다운 파이프라인: unified 프로세서로 예전 HTML 재현하기

## 한 줄 요약

`lib/posts.ts`의 unified 체인을 `config/markdown.mjs`의 `markdown.processor: unified({ … })`로 옮겼다. 플러그인 이름은 같아도 메이저 버전이 올라가며 기본값이 달라져서, 그 차이를 예전 값으로 되돌린 뒤에야 12개 글의 본문이 배포본과 같아졌다.

## 개념

- **엔진은 `markdown.processor`가 고른다.** Astro 7의 기본은 Sätteri이고 자기 플러그인 모델(`mdastPlugins`, `hastPlugins`)을 쓴다. `@astrojs/markdown-remark`의 `unified()`를 넣으면 예전과 같은 remark → rehype 체인이 된다.
- **`unified()`가 만드는 체인**(`node_modules/@astrojs/markdown-remark/dist/index.js`에서 읽었다): remark-parse → remark-gfm(`gfm`) → remark-smartypants(`smartypants`) → 내 `remarkPlugins` → remark-rehype(`allowDangerousHtml: true` 고정 + 내 `remarkRehype`) → Shiki(`markdown.syntaxHighlight`) → 내 `rehypePlugins` → 제목 `id` → rehype-raw → rehype-stringify. 내가 정하는 것은 "사이에 끼울 플러그인"과 "끌 것"뿐이다.
- **`syntaxHighlight`는 processor 밖**, `markdown` 바로 아래 키다. `false`로 꺼야 `<pre><code class="language-ts">`가 그대로 rehype-highlight까지 온다. 켜 두면 Shiki가 먼저 `<pre class="astro-code">`로 바꾼다.
- **raw HTML**: 글 안의 `<details>`, `<img width>`, `<br>`은 remark-rehype가 `raw` 노드로 넘기고 맨 끝의 rehype-raw가 실제 요소로 파싱한다. 따로 켤 옵션이 없다. 내 rehype 플러그인이 도는 시점에는 아직 문자열이다.
- **언제 도는가**: 페이지를 그릴 때가 아니라 빌드 맨 앞 `Syncing content`에서 glob 로더가 글마다 렌더해 `node_modules/.astro/data-store.json`에 HTML을 넣는다. `[id].astro`의 `render(post)`는 그것을 꺼내 `<Content />`로 준다.
- **캐시 주의**: 스토어는 글 내용이나 설정 값이 바뀌면 다시 렌더하지만 플러그인 **패키지 버전**이 바뀐 것은 모른다. 의존성을 바꿨으면 스토어 파일을 지우고 빌드한다.

## Next.js 대응

| 예전 (`git show main:lib/posts.ts`의 `getPostData`)                            | 지금 (`config/markdown.mjs`)                                               | 버전                      |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------- |
| `.use(remarkParse)`                                                            | `unified()` 내장                                                           | 10 → 11                   |
| `.use(remarkGfm)`                                                              | `gfm: true`(기본값)                                                        | 3 → 4                     |
| `.use(remarkMath)`                                                             | `remarkPlugins: [remarkMath]`                                              | 5 → 6                     |
| `.use(remarkRehype, { allowDangerousHtml: true })`                             | 내장. 더할 옵션만 `remarkRehype: { footnoteBackLabel }`                    | 10 → 11                   |
| `.use(rehypeKatex)`                                                            | `rehypePlugins`의 첫째                                                     | 6 → 7 (KaTeX 0.13 → 0.16) |
| `.use(rehypeHighlight)`                                                        | `rehypePlugins`의 둘째 + `{ detect: true, languages }`                     | 5 → 7 (lowlight 2 → 3)    |
| `.use(rehypeStringify, { allowDangerousHtml: true })`                          | 내장 rehype-raw → rehype-stringify                                         | 9 → 10                    |
| 없음                                                                           | Astro가 덧붙임: 제목 `id`. 끈 것: `smartypants`, Shiki                     |                           |
| `contentHtml` → `<Main dangerouslySetInnerHTML>` (`pages/posts/[id].page.tsx`) | `render(post)` → `<main><Content /></main>` (`src/pages/posts/[id].astro`) |                           |

## 빌드 결과물에서 확인하기

- `dist/posts/ts-ambient-type-declaration.html`: `<pre><code class="hljs language-ts"><span class="hljs-keyword">declare</span> …`. 배포본(`.verify/baseline/posts/` 아래 같은 파일)과 클래스·span 순서까지 같다. 제목은 `<h2 id="i-앰비언트-타입-선언">`처럼 `id`만 더 붙었다.
- `dist/posts/how-to-check-two-types-are-equal-in-ts.html`: `grep -o 'class="katex"' <파일> | wc -l` → 121. `<details>` 2개, 각주 링크의 `aria-label="Back to content"`.
- `dist/posts/proxy-to-built-in-objects.html`: 언어를 적지 않은 블록이 `<code class="hljs language-javascript">`(자동 감지).
- `dist/posts/css-masters-2-week1.html`: `<img width="600" alt="전체 선택자" …>`가 그대로 있고, 본문 따옴표는 곧은 `type="text"`.
- 12개 글 전체를 임시 스크립트로 비교한 결과: `main` 직계 자식의 태그 순서 12/12, `pre > code`의 클래스와 span (클래스, 텍스트) 71/71, `.katex` 121 = 121.

## 닫힌 고리가 잡아낸 것

- **Red**: 기본 엔진으로는 `content` 8/13. 네 글은 따옴표·말줄임표가 바뀌었고(`"usage"` → `“usage”`, `...` → `…`), 수식 글은 `$A$`가 글자로 남았다 → `unified()` + `smartypants: false` + remark-math, rehype-katex로 13/13.
- **`content`가 못 보는 차이 1**: 텍스트는 같은데 `proxy-to-built-in-objects`의 언어 없는 블록에 클래스와 색이 없었다. rehype-highlight 5는 자동 감지가 기본이었고 7은 꺼져 있다 → `detect: true`.
- **차이 2**: TypeScript 블록 4개(`react-programming-ch09`의 2·3번째, `ts-ambient-type-declaration`의 3·4번째, 0부터 셈)에 `hljs-attr` 7개와 `hljs-title function_` 1개가 더 생겼다. lowlight 3 안의 highlight.js 11.11.2 문법이 달라서다. 뒤의 것은 monokai에서 초록 굵은 글씨라 픽셀이 달라진다.
- **실패한 가설**: `overrides`로 highlight.js를 11.5.1에 고정 → 빌드는 통과했는데 차이가 그대로였다. 스토어 캐시가 옛 HTML을 돌려준 것이었고, 스토어를 지우자 `HighlightJs.newInstance is not a function`으로 빌드가 깨졌다(lowlight 3은 11.8.0에 생긴 API를 쓴다). 되돌렸다.
- **고친 방법**: 엔진은 두고 **문법 파일만** 루트의 `highlight.js@11.5.1`에서 가져와 `languages`로 넘겼다(예전 lowlight 2.6.1이 등록하던 35개 언어). 71/71.
- **차이 3**: 각주 되돌아가기 링크의 `aria-label`이 `Back to reference 1`로 바뀌었다 → `footnoteBackLabel: "Back to content"`.
- **남긴 차이**(수식 글 하나, 설정으로는 못 바꾼다): 수식을 감싸던 `<span class="math math-inline">` 121개가 없어졌고, KaTeX 0.16이 인라인 스타일을 반올림한다(`margin-right:0.07153em` → `0.0715em` 등 93곳). 감싸던 span을 겨냥한 CSS는 배포본에 없다. 픽셀 영향은 `visual` 검사가 판정한다.

## 직접 해볼 실험

끝나면 매번 `git checkout config/markdown.mjs`로 되돌린다.

1. 기본 엔진(Sätteri)으로 빌드하기: `echo 'export default {};' > config/markdown.mjs` 후 `npm run -s verify -- --only=content --no-check`.
   <details><summary>예상 결과</summary>`FAIL content 8/13`. 실패한 글은 `css-masters-2-week1`, `how-to-check-two-types-are-equal-in-ts`, `react-scripts-react-app-polyfill-promise-any`, `regular-expression-1`, `ts-ambient-type-declaration`. `grep -o astro-code dist/posts/*.html | wc -l` → 71(코드 블록이 전부 Shiki의 `<pre class="astro-code github-dark" style="background-color:#24292e;…">`), `grep -o 'class="katex"' dist/posts/*.html | wc -l` → 0, `grep -o 'class="hljs' dist/posts/*.html | wc -l`도 0(그냥 `hljs`를 세면 글 페이지에 실린 monokai CSS의 선택자까지 센다).</details>
2. `detect: true, `를 지우고 같은 명령을 돌린 뒤 `grep -c 'hljs language-javascript' dist/posts/proxy-to-built-in-objects.html`.
   <details><summary>예상 결과</summary>`PASS content 13/13`인데 grep은 0이다(지금은 1). 그 블록은 `<pre><code>Uncaught TypeError…`로 나온다. 텍스트만 보는 검사로는 색이 빠진 것을 알 수 없다. `--only=visual --route=/posts/proxy-to-built-in-objects`로 돌리면 `FAIL visual 0/6`(페이지 높이 -27)이다.</details>
3. `{ detect: true, languages }`를 `{ detect: true }`로 바꾸고 같은 명령을 돌린 뒤 `grep -o 'hljs-title function_">assertIsString' dist/posts/react-programming-ch09.html | wc -l`.
   <details><summary>예상 결과</summary>`PASS content 13/13`, grep은 4(지금과 배포본은 3). 새 문법은 `const assertIsString (val: any) => …` 줄의 `assertIsString`을 함수 이름으로 더 잡고, `function assertIsString(val: any)`의 `val`과 `function yell(str: any)`의 `str`에 `hljs-attr`를 붙인다.</details>

## 문서 근거

- https://docs.astro.build/en/reference/markdown-processors/unified/ (`unified()`의 `remarkPlugins`, `rehypePlugins`, `remarkRehype`, `gfm`, `smartypants`)
- https://docs.astro.build/en/reference/markdown-processors/satteri/ (기본 엔진, `features.smartPunctuation`)
- https://docs.astro.build/en/guides/syntax-highlighting/ 와 https://docs.astro.build/en/reference/configuration-reference/ (`markdown.syntaxHighlight: false`)
- https://docs.astro.build/en/guides/markdown-content/ (제목 `id` 자동 주입)
- 문서에 없어 직접 확인한 것: 플러그인이 끼는 순서와 raw HTML 통과(패키지 소스), rehype-highlight 7의 `detect` 기본값, lowlight 3과 highlight.js 11.5.1이 맞지 않는다는 것, 스토어가 의존성 버전을 모른다는 것.
