Astro Fonts API summary (sources: https://docs.astro.build/en/guides/fonts/ and https://docs.astro.build/en/reference/configuration-reference/). Both pages were read in full, except the config reference, which was cut at about 39.9k of 122.9k characters. Facts from the rest of that page come from a model-extracted summary and are marked [summary].

Config

- `fonts` is a top-level array in `astro.config.mjs`, default `[]`, "Added in astro@6.0.0" (config ref, [summary] for the default and version line). Import helpers from `astro/config`: `import { defineConfig, fontProviders } from "astro/config";` (guides/fonts).
- Required per font: `name`, `cssVariable` (must start with `--`), `provider` (guides/fonts; config ref).
- Optional keys and defaults (config ref, [summary]): `fallbacks` default `["sans-serif"]`; `optimizedFallbacks` default `true`; `weights` default `[400]`; `styles` default `["normal", "italic"]`; `subsets` default `["latin"]`; `formats` default `["woff2"]` (allowed: woff2, woff, otf, ttf, eot); `display` default `"swap"` (auto, block, swap, fallback, optional); `options` (provider-specific, untyped in summary); `unicodeRange`, `stretch`, `featureSettings`, `variationSettings` default undefined.
- `fallbacks: []` disables fallbacks; `optimizedFallbacks: false` turns off automatic fallback generation (config ref, [summary]). guides/fonts says Astro generates optimized fallbacks from the last generic family, and it defaults to `sans-serif`.

Providers

- Built-in providers (guides/fonts): Adobe, Bunny, Fontshare, Fontsource, Google, Google Icons, and NPM, plus `local` for your own files. Call them as `fontProviders.local()`, `fontProviders.google()`, `fontProviders.fontsource()`, etc. The NPM provider is named in the guide but its details are not in the pages I read. Check https://docs.astro.build/en/reference/font-provider-reference/ for it.
- Local example (guides/fonts): `provider: fontProviders.local()` with `options: { variants: [{ src: ['./src/assets/fonts/DistantGalaxy.woff2'], weight: 'normal', style: 'normal' }] }`. The guide says the font file goes inside `src/`.
- Variable fonts: local uses `weight: "100 900"` in a variant. Other providers use `weights: ["300 700"]` (guides/fonts).
- Fontsource example: `provider: fontProviders.fontsource()`, `name: "Roboto"`, `cssVariable: "--font-roboto"`.
- Same font may appear multiple times with different weights/styles; Astro merges them (guides/fonts, granular configuration).

Component and usage

- `import { Font } from "astro:assets";` then `<Font cssVariable="--font-distant-galaxy" />` in `<head>`, usually in a layout (guides/fonts). Use `preload` as a bare attribute to preload (guides/fonts, preloading).
- Preload: "pass the `preload` property to the corresponding `<Font />` component". For multi-file fonts you can pass an array (guides/fonts). Caveat: "Font preloading should be done sparingly" (guides/fonts).
- Use the variable in CSS: `font-family: var(--font-distant-galaxy);` (guides/fonts). Tailwind 4: `@theme inline { --font-sans: var(--font-roboto); }` (guides/fonts).

Caveats and caching

- Fonts are downloaded and served from your own site, not from the provider's CDN (guides/fonts).
- Build output goes to `_astro/fonts` with a long HTTP cache (guides/fonts). Dev cache: delete `.astro/fonts`. Build cache: delete `node_modules/.astro/fonts` (guides/fonts).
- Programmatic access: `fontData` and `experimental_getFontFileURL` from `astro:assets` (guides/fonts).

Third-party CSS such as KaTeX via npm import

- The fonts guide has no section on importing third-party CSS. I found no documented config key for it. Import the CSS in your code (for example, from a layout or a component) in the usual way. Astro's CSS handling is in https://docs.astro.build/en/guides/styling/, which I did not read.
- Related config [summary]: `build.inlineStylesheets` (default `auto`) controls inlining of project stylesheets. `security.csp` notes that external styles are not supported out of the box, but you can supply your own hashes. This could matter if KaTeX or other CSS is loaded from an external stylesheet.
- I did not verify a KaTeX-specific recipe. The KaTeX font files would need to be handled by Vite's asset pipeline or the Fonts API, and the pages I read do not say which.

Version note: the pages describe the current docs. I did not confirm anything specific to Astro 7.4 beyond the "Added in" markers above.
