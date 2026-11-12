import { defineConfig } from "astro/config";

import markdown from "./config/markdown.mjs";

export default defineConfig({
  site: "https://bigsaigon333.github.io",
  trailingSlash: "never",
  build: { format: "file" },
  markdown,
  vite: {
    build: {
      // Vite 8 의 기본 대상(safari16.4 이상)에서는 @media (max-width: 600px) 가 (width<=600px) 로 바뀌어 나오고,
      // 그 문법을 모르는 Safari 16.4 미만은 규칙을 통째로 무시한다. 배포본은 max-width 를 그대로 내보냈으므로 맞춘다.
      cssTarget: ["chrome87", "edge88", "firefox78", "safari14"],
    },
  },
});
