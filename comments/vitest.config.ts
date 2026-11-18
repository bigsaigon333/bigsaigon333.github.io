import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// 시험은 workerd 안에서 돈다. D1 은 로컬(메모리)이고, 시험 파일마다 저장소가 따로다.
// 마이그레이션은 vitest.setup.ts 가 applyD1Migrations 로 적용한다.
// 경로는 이 패키지 디렉터리 기준이다(npm --prefix comments / npm -w comments 모두 여기서 돈다).
export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      wrangler: { configPath: "./wrangler.jsonc", environment: "test" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations("migrations"),
          GH_OAUTH_CLIENT_ID: "test-client",
          GH_OAUTH_CLIENT_SECRET: "test-secret",
        },
      },
    })),
  ],
  test: {
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
