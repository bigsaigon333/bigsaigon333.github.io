// The lab's config: a shared base plus one seam per demo (config/s82.mjs … s85.mjs).
// Each demo edits only its own seam; this file merges them in order.
import node from "@astrojs/node";
import { defineConfig } from "astro/config";

import s82 from "./config/s82.mjs";
import s83 from "./config/s83.mjs";
import s84 from "./config/s84.mjs";
import s85 from "./config/s85.mjs";

const isPlainObject = (value) =>
  Object.prototype.toString.call(value) === "[object Object]";

// Objects merge key by key, arrays concatenate (integrations, vite.plugins), anything else is
// replaced by the later value. Adapter instances are objects too, so a seam must not set `adapter`.
export function deepMerge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (Array.isArray(out[key]) && Array.isArray(value))
      out[key] = [...out[key], ...value];
    else if (isPlainObject(out[key]) && isPlainObject(value))
      out[key] = deepMerge(out[key], value);
    else out[key] = value;
  }
  return out;
}

const base = {
  // Static by default: a page or endpoint opts into on-demand rendering with `prerender = false`.
  output: "static",
  adapter: node({ mode: "standalone" }),
  integrations: [],
};

export default defineConfig([s82, s83, s84, s85].reduce(deepMerge, base));
