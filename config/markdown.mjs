// astro.config.mjs 의 `markdown` 값.
//
// Astro 7 의 기본 엔진 Sätteri 와 기본 하이라이터 Shiki 를 쓴다(S4.1). 예전 unified 체인
// (remark-gfm → remark-math → remark-rehype → rehype-katex → rehype-highlight)이 하던 일을 이렇게 옮겼다:
//   - GFM(표, 취소선, 체크박스, 각주, 자동 링크): Sätteri 기본값. 각주 문구만 예전 값으로 되돌린다.
//   - 수식: Sätteri 의 math 기능이 `$…$` 를 inlineMath 노드로 읽고, 아래 mdast 플러그인이 KaTeX HTML 로 바꾼다.
//   - 코드 블록: Shiki 가 빌드 때 칠한다(인라인 style). 라이트·다크 두 테마를 CSS 변수로 함께 싣는다.
//   - 원시 HTML: Sätteri 는 기본으로 raw 노드를 그대로 내보낸다. 단, 상대 경로 `<img>` 는 html-images 플러그인이
//     Markdown 이미지로 바꿔 astro:assets 가 최적화하게 한다(S4.3).
import { satteri } from "@astrojs/markdown-satteri";
import katex from "katex";

import { htmlImagesPlugin } from "./html-images.mjs";

// rehype-katex 7 이 하던 것과 같은 호출이다. throwOnError 로 먼저 시도하고, 실패하면 오류 표시로 그린다.
function renderMath(value, displayMode) {
  try {
    return katex.renderToString(value, { displayMode, throwOnError: true });
  } catch {
    return katex.renderToString(value, {
      displayMode,
      strict: "ignore",
      throwOnError: false,
    });
  }
}

const katexPlugin = {
  name: "katex",
  inlineMath(node, ctx) {
    ctx.replaceNode(node, {
      type: "html",
      value: renderMath(node.value, false),
    });
  },
  math(node, ctx) {
    ctx.replaceNode(node, {
      type: "html",
      value: renderMath(node.value, true),
    });
  },
};

// <code> 에 `language-<언어>` 클래스를 붙인다. 코드 글꼴(Source Code Pro, 0.825rem)은 global.css 의
// `code[class*="language-"]` 가 정하는데, Shiki 는 이 클래스를 붙이지 않는다(언어는 <pre data-language> 에만 있다).
// 언어를 적지 않은 블록은 Shiki 가 "plaintext" 로 받으므로 `language-plaintext` 가 되어 같은 글꼴을 받는다.
// 예전 rehype-highlight 는 그런 블록의 언어를 자동 감지해 language-javascript 따위를 붙였었다.
const languageClass = {
  name: "language-class",
  code(node) {
    this.addClassToHast(node, `language-${this.options.lang}`);
  },
};

export default {
  syntaxHighlight: { type: "shiki", excludeLangs: ["math"] },
  shikiConfig: {
    // 색은 style="--shiki-light:…;--shiki-dark:…" 로만 싣는다. 어느 쪽을 쓸지는 src/styles/code.css 가 정한다.
    themes: {
      light: "github-light-high-contrast",
      dark: "github-dark-high-contrast",
    },
    defaultColor: false,
    transformers: [languageClass],
  },
  processor: satteri({
    features: {
      // 예전 remark-rehype 10 의 각주 되돌아가기 링크 aria-label. Sätteri 기본값은 "Back to reference 1" 이다.
      gfm: { footnotes: { backLabel: "Back to content" } },
      math: true,
      // 예전 체인에는 smartypants 가 없었다.
      smartPunctuation: false,
    },
    mdastPlugins: [katexPlugin, htmlImagesPlugin],
  }),
};
