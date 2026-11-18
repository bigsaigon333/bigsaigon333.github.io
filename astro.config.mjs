import { defineConfig } from "astro/config";

import csp from "./config/csp.mjs";
import env, { envDir } from "./config/env.mjs";
import fonts from "./config/fonts.mjs";
import localIntegrations from "./config/integrations.mjs";
import markdown from "./config/markdown.mjs";

export default defineConfig({
  site: "https://bigsaigon333.github.io",
  trailingSlash: "never",
  // PF5: 페이지의 CSS 를 모두 <style> 로 넣어 렌더를 막는 CSS 요청을 없앤다(쪽마다 2 → 0, Lighthouse 모바일 FCP 약
  // 900ms → 640ms). 하나로 합친 외부 파일(vite cssCodeSplit: false)은 1개·약 750ms 에 홈이 안 쓰는 규칙까지 받아 버렸다.
  // <style> 의 해시는 config/csp.mjs 가 모든 페이지의 정책에 합쳐 싣는다.
  build: { format: "file", inlineStylesheets: "always" },
  markdown,
  // 로컬 통합(site-guard: 빌드 뒤 링크·JS 예산 검사)은 config/integrations.mjs 에 있다.
  // CSP(S7.2, config/csp.mjs)는 빌드 뒤 정책 meta 를 옮기므로 마지막에 둔다.
  integrations: [...localIntegrations, csp()],
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
