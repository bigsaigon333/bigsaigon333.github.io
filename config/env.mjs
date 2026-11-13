// astro:env 설정. astro.config.mjs 의 env 키가 이 객체를 그대로 쓴다.
//
// 세 값 모두 빌드할 때 HTML 에 글자로 박히는 공개 값이다(비밀이 아니다). 그래서 access: "public".
// 쓰는 곳은 서버(빌드)에서 렌더하는 컴포넌트뿐이고 번들되는 클라이언트 스크립트는 읽지 않는다 → context: "server",
// astro:env/server 에서 가져온다(src/lib/site.ts).
//
// 값은 config/.env.production(빌드), config/.env.development(astro dev), config/.env.test(Vitest)에 커밋해 둔다. 그래서 로컬·CI 모두 아무것도
// 설정하지 않고 빌드된다. 같은 이름의 환경 변수를 넘기면 파일보다 우선한다(Vite loadEnv).
// astro.config.mjs 가 아래 envDir 를 vite.envDir 로 넘긴다. 절대 경로인 이유: Astro 의 env 로더는 envDir 를 그대로
// loadEnv 에 넘겨, 상대 경로면 프로젝트 루트가 아니라 작업 디렉터리 기준이 된다. 값이 비었거나 아래 제약에 어긋나면 빌드가 그 변수 이름을 대며 멈춘다.
// default 를 주지 않는 이유: default 가 있으면 값이 빠져도 조용히 그 값으로 빌드되어 "빠짐"을 잡을 수 없다.
import { fileURLToPath } from "node:url";

import { envField } from "astro/config";

/** .env.<mode> 파일이 있는 디렉터리(이 파일 옆, config/). */
export const envDir = fileURLToPath(new URL(".", import.meta.url));

export default {
  schema: {
    // GA4 측정 ID(gtag.js 의 id, gtag("config", …)).
    GA_MEASUREMENT_ID: envField.string({
      context: "server",
      access: "public",
      startsWith: "G-",
    }),
    // Search Console 소유 확인 토큰(<meta name="google-site-verification">). 43자(SHA-256 의 base64url).
    GOOGLE_SITE_VERIFICATION: envField.string({
      context: "server",
      access: "public",
      length: 43,
    }),
    // utterances 가 댓글 이슈를 여는 GitHub 저장소 "owner/repo".
    UTTERANCES_REPO: envField.string({
      context: "server",
      access: "public",
      includes: "/",
    }),
  },
};
