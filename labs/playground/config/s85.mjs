// Config seam of demo S8.5: Astro 7 route cache, the logger handler API and a dev toolbar app.
// The live collection lives in src/live.config.ts (no config key needed).
import { logHandlers, memoryCache } from "astro/config";

import s85Toolbar from "../src/s85/toolbar-integration.mjs";

export default {
  // In-memory LRU cache in front of on-demand routes. Off in `astro dev`.
  cache: { provider: memoryCache() },
  // Config-level rules. Route calls to Astro.cache.set() merge over them.
  routeRules: {
    "/s85/cache/rule/[...path]": { maxAge: 60, tags: ["s85-rule"] },
  },
  // Keep Astro's default node output and also record warn+ messages for /s85/logger.
  logger: logHandlers.compose(logHandlers.node(), {
    entrypoint: "./src/s85/log-recorder.mjs",
    config: { level: "warn" },
  }),
  integrations: [s85Toolbar()],
};
