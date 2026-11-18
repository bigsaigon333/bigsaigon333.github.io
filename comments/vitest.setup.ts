import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { D1Migration } from "@cloudflare/vitest-plugin";
import type { Env as WorkerEnv } from "./src/env";

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: D1Migration[];
    }
    // `import { exports } from "cloudflare:workers"` 의 타입(exports.default.fetch).
    interface GlobalProps {
      mainModule: typeof import("./src/index");
    }
  }
}

// 이미 적용한 마이그레이션은 건너뛰므로 시험 파일마다 불러도 된다.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
