import mdx from "@astrojs/mdx";
import { defineConfig } from "astro/config";

import { satteri } from "@astrojs/markdown-satteri";

import csp from "./config/csp.mjs";
import env, { envDir } from "./config/env.mjs";
import fonts from "./config/fonts.mjs";
import localIntegrations from "./config/integrations.mjs";
import markdown from "./config/markdown.mjs";

// .mdx 용 Sätteri 처리기. .md 와 같은 기능·플러그인을 쓰되, mdast 플러그인이 넣는 `html` 노드만 바꿔 넣는다.
// MDX 는 결과가 JSX 라 불투명한 raw HTML 노드를 컴파일하지 못한다(mdxjs-rs:raw-html). 그래서
// ctx.replaceNode(node, { type: "html", value }) 를 { raw: value, mdxExpressions: false } 로 바꿔
// HTML 을 JSX 로 파싱하게 한다(KaTeX 출력의 `{` 는 식으로 읽지 않는다). .md 의 처리기는 그대로 둔다.
const toMdxPlugin = (plugin) =>
  Object.fromEntries(
    Object.entries(plugin).map(([key, visit]) => [
      key,
      typeof visit !== "function"
        ? visit
        : function (node, ctx) {
            const mdxCtx = new Proxy(ctx, {
              get(target, prop) {
                if (prop === "replaceNode")
                  return (old, next) =>
                    target.replaceNode(
                      old,
                      next?.type === "html"
                        ? { raw: next.value, mdxExpressions: false }
                        : next,
                    );
                const value = Reflect.get(target, prop, target);
                return typeof value === "function" ? value.bind(target) : value;
              },
            });
            return visit.call(this, node, mdxCtx);
          },
    ]),
  );

const mdxProcessor = satteri({
  ...markdown.processor.options,
  mdastPlugins: markdown.processor.options.mdastPlugins.map(toMdxPlugin),
});

export default defineConfig({
  site: "https://bigsaigon333.github.io",
  trailingSlash: "never",
  build: { format: "file" },
  markdown,
  // .mdx 는 markdown 설정(Shiki 등)을 물려받는다(extendMarkdownConfig 기본값 true). 처리기만 위의 mdxProcessor 로 바꾼다.
  // 로컬 통합(site-guard: 빌드 뒤 링크·JS 예산 검사)은 config/integrations.mjs 에 있다.
  // CSP(S7.2, config/csp.mjs)는 빌드 뒤 정책 meta 를 옮기므로 마지막에 둔다.
  integrations: [mdx({ processor: mdxProcessor }), ...localIntegrations, csp()],
  fonts,
  // GA 측정 ID, 사이트 소유 확인 토큰, utterances 저장소(astro:env 스키마). 값은 config/.env.<mode> 에 있다.
  env,
  // View Transitions(S6.2)의 <ClientRouter /> 와 함께 쓰는 prefetch. 같은 사이트의 모든 링크를 포인터를 올리거나
  // 포커스할 때(hover) 미리 받는다. ClientRouter 가 있으면 prefetchAll 의 기본값이 true 지만 드러내 적는다.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  vite: {
    // .env.<mode> 를 루트 대신 config/ 에서 읽는다(config/env.mjs 의 스키마 옆).
    envDir,
    build: {
      // Vite 8 의 기본 대상(safari16.4 이상)에서는 @media (max-width: 600px) 가 (width<=600px) 로 바뀌어 나오고,
      // 그 문법을 모르는 Safari 16.4 미만은 규칙을 통째로 무시한다. 배포본은 max-width 를 그대로 내보냈으므로 맞춘다.
      cssTarget: ["chrome87", "edge88", "firefox78", "safari14"],
    },
  },
});
