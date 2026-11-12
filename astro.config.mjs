import { defineConfig } from "astro/config";

import markdown from "./config/markdown.mjs";

export default defineConfig({
  site: "https://bigsaigon333.github.io",
  trailingSlash: "never",
  build: { format: "file" },
  markdown,
});
