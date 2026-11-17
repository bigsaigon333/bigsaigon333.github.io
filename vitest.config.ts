/// <reference types="vitest/config" />
import { getViteConfig } from "astro/config";

// getViteConfig 가 astro.config.mjs 를 읽어 .astro 컴파일러와 astro:* 가상 모듈을 Vitest 에 붙인다.
// 단위 시험만 돈다: 빌드 결과물 검사는 scripts/verify 가 맡는다.
export default getViteConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
