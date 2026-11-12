// astro.config.mjs 의 `markdown` 값.
//
// 예전 lib/posts.ts 의 unified 체인을 그대로 옮긴 것이다:
//   remark-parse → remark-gfm → remark-math → remark-rehype(allowDangerousHtml) → rehype-katex → rehype-highlight
//   → rehype-stringify
// remark-parse, remark-rehype(allowDangerousHtml: true), rehype-stringify 는 `unified()` 프로세서가 스스로 넣는다.
// 여기서는 그 사이에 끼울 플러그인을 넣고, 플러그인 메이저 버전이 올라가며 달라진 기본값을 예전 값으로 되돌린다.
import { unified } from "@astrojs/markdown-remark";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

// 예전 빌드(rehype-highlight 5 → lowlight 2.6.1)가 등록하던 언어 35개.
// prettier-ignore
const OLD_LANGUAGES = [
  "arduino", "bash", "c", "cpp", "csharp", "css", "diff", "go", "ini", "java", "javascript", "json", "kotlin",
  "less", "lua", "makefile", "markdown", "objectivec", "perl", "php", "php-template", "plaintext", "python",
  "python-repl", "r", "ruby", "rust", "scss", "shell", "sql", "swift", "typescript", "vbnet", "xml", "yaml",
];

// 문법 파일을 package.json 에 고정한 highlight.js 11.5.1 에서 가져온다(예전 사이트가 쓰던 버전).
// rehype-highlight 7 이 기본으로 쓰는 문법은 lowlight 3 안의 highlight.js 11.11 것이라 TypeScript 토큰이 달라진다.
const languages = Object.fromEntries(
  await Promise.all(
    OLD_LANGUAGES.map(async (name) => {
      const grammar = await import(`highlight.js/lib/languages/${name}`);
      return [name, grammar.default];
    }),
  ),
);

export default {
  // Astro 내장 하이라이터(Shiki)를 끈다. 코드 블록은 아래 rehype-highlight 가 highlight.js 클래스로 칠한다.
  syntaxHighlight: false,
  processor: unified({
    // remark-gfm: 표, 취소선, 체크박스, 각주, 자동 링크.
    gfm: true,
    // 예전 체인에는 smartypants 가 없었다. 켜 두면 "…" 가 “…” 로, ... 가 … 로 바뀐다.
    smartypants: false,
    remarkPlugins: [remarkMath],
    // remark-rehype 11 은 각주 되돌아가기 링크의 aria-label 을 "Back to reference 1" 로 쓴다. 10 의 문구로 되돌린다.
    remarkRehype: { footnoteBackLabel: "Back to content" },
    rehypePlugins: [
      rehypeKatex,
      // detect: 예전 rehype-highlight 5 는 언어를 적지 않은 코드 블록도 자동 감지해서 칠했다. 7 은 기본이 꺼짐이다.
      [rehypeHighlight, { detect: true, languages }],
    ],
  }),
};
