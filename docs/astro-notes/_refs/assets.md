Summary of the two Astro docs pages (Astro 7 docs, as served on 2026-11-13). Both pages were read in full up to a truncation point. Parts after that point are from a model-written summary, and I mark them below.

IMAGES (https://docs.astro.build/en/guides/images/)
- Local images belong in `src/` so Astro can optimize them. `public/` files are copied as-is and never processed. The page says "Images stored in the `public/` folder are never optimized."
- Markdown syntax: `![alt](src)`. A relative path to a `src/` image works, e.g. `![A starry night sky.](../assets/stars.png)`. A `public/` image uses a root path, e.g. `![A starry night sky.](/images/stars.png)`. A remote image uses its full URL. Local and remote images in `.md` are processed. `public/` ones are not.
- Markdown image syntax has no width/height attributes. The page does not document any width or density syntax for Markdown `![]()`.
- `<Image />` and `<Picture />` are unavailable in `.md` files. The page says that for finer control you should use MDX, where `<Image src={rocket} alt="..." />` works after `import { Image } from 'astro:assets';` and an import of the image.
- `<Image />` requires `alt`. The page says "`alt` is mandatory on the Image component", and `alt=""` is for decorative images.
- `<Image />` attributes: it accepts `width`/`height` for remote or unimported images. Local imports get dimensions automatically. Prerendered output gets `decoding="async"` and `loading="lazy"`.
- Responsive images: `layout` on `<Image />`/`<Picture />`, or globally via `image.layout` in config. The page says the global setting "will also apply to any local and remote images using the Markdown `![]()` syntax." Also `image.responsiveStyles: true` enables Astro's default styles. The default is `false`.
- The `srcset`/`sizes` behavior is set by layout (`constrained`, `full-width`). The page does not describe 1x/2x density descriptors.
- Model-summary only (not verbatim, not checked on the page): Sharp is the default image service, and processed assets are cached in `./node_modules/.astro` (`cacheDir` config).

MARKDOWN (https://docs.astro.build/en/guides/markdown-content/)
- Since Astro v7, Sätteri is the default Markdown processor, and it works without install or config. The page says "Since Astro v7, Sätteri is the default Markdown processor."
- Config key: `markdown.processor`, added in astro@6.4.0.
- Install and import for a custom Sätteri setup: `npm install @astrojs/markdown-satteri`, then `import { satteri } from "@astrojs/markdown-satteri";` and `processor: satteri({ ... })` under `markdown` in `astro.config.mjs` (from `defineConfig` in `"astro/config"`).
- Verbatim example from the page: `mdastPlugins: [imgAttr({ defaults: { loading: "lazy", decoding: "async" } })]` with `import imgAttr from "satteri-imgattr";`, and `hastPlugins: [satteriCallouts()]`. These are community plugins, not part of Astro.
- Options shown: `features: { gfm: false }`, `features: { smartPunctuation: false }`, and `features: { gfm: { footnotes: {...} } }`. `mdastPlugins` and `hastPlugins` are the plugin arrays.
- Heading IDs: `satteriHeadingIdsPlugin` from `@astrojs/markdown-satteri` is placed before plugins that need IDs, in `hastPlugins`.
- Model-summary only (not verbatim): Sätteri mdast plugins are created with `defineMdastPlugin` from `"satteri"`, and the page's example calls the factory, e.g. `exampleMdastPlugin()`. The mdast plugin has a `text(node, ctx)` hook, and frontmatter is accessed as `ctx.data.astro` (guard with `ctx.data.astro !== undefined`). Frontmatter edits go to `data.astro.frontmatter`. I could not verify these exact names against the page text, so check the reference page before using them.
- Unified alternative: `import { unified } from "@astrojs/markdown-remark";` for remark/rehype plugins.
- Caveat: Remote Markdown cannot use Astro's processor. Use a content loader with `renderMarkdown()`.

NOT READ: The Sätteri reference page (https://docs.astro.build/en/reference/markdown-processors/satteri/) has the full `satteri()` option list and the authoritative mdast plugin API. The page is linked from the Markdown guide but was not fetched, so the details above on the mdast plugin API are not confirmed.
Version note: these are current docs. I could not confirm them against Astro 7.4 specifically.

---

Earlier scout summary (first S4.3 attempt, astro:assets reference):

Astro 7.4 image facts. Sources: the docs pages are the current (latest) docs, not pinned to 7.4, and I did not verify 7.4 specifically. Read: https://docs.astro.build/en/guides/images/ and https://docs.astro.build/en/reference/modules/astro-assets/. Items marked [summary] came from the fetch tool's model summary of text it did not show verbatim.

Imports
- `import { Image, Picture, getImage, inferRemoteSize, getConfiguredImageService, imageConfig } from 'astro:assets'` (astro-assets ref). Also `Font` and `fontData` (added 6.0.0).
- `astro/assets` exports `getImage(options, imageConfig)`, `baseService`, `isLocalService`. `astro/assets/utils` has helpers such as `isRemoteAllowed`, `matchPattern`, `hashTransform` [summary].

<Image />: added astro@3.0.0 (ref page)
- `src` (required): imported ImageMetadata for src/ files; a string path for public/ (e.g. "/images/x.jpg"); a full URL for remote.
- `alt` (required). Use `alt=""` for decorative images.
- `width`/`height`: required for public/ images. Optional for src/ (inferred) and for remote images only if `inferSize` is set.
- `inferSize`: default false, added 4.4.0. Only fetches dimensions for authorized remote domains (17 Dec 5.17.3 note).
- `format`: default is webp (guides page).
- `quality`: presets low/mid/high/max, or a number 0-100.
- `layout`: constrained | full-width | fixed | none. Default `image.layout` or 'none'. Added 5.10.0.
- `fit`: default `image.objectFit` or 'cover'. `position`: default `image.objectPosition` or 'center'. Added 5.10.0.
- `priority`: default false, added 5.10.0. Sets loading=eager, decoding=sync, fetchpriority=high.
- `densities` (added 3.3.0): not compatible with `layout`. `widths` + `sizes` (added 3.3.0): `sizes` is required with `widths`.
- `background` (added 5.17.0): passed to the service when flattening, e.g. "#ffffff". Sharp default is black.
- Extra HTML img attributes pass through.

<Picture />: added astro@3.3.0 (ref page)
- Accepts all Image props, plus `formats` (default ['webp'], order = priority), `fallbackFormat` (default png, or jpg for JPGs, gif if animated, svg for SVGs), and `pictureAttributes` (applies to the outer <picture>).
- Example output: <source type="image/avif"> and <source type="image/webp"> followed by <img> with png fallback.

getImage() (guides + ref)
- Server-only; throws on the client. Accepts the same options as Image except `alt` and `sizes`. Supports `inferSize: true`.
- Returns `GetImageResult`: `src`, `srcSet`, `attributes`, `options`, `rawOptions`.

Responsive
- Layout added in astro@5.10.0. Global default: `image.layout`. `image.responsiveStyles` defaults to false (must be enabled for auto styles). `image.objectFit` and `image.objectPosition` are the global defaults.
- Responsive images are not generated for public/ images.
- Responsive for Markdown `![]()` applies when `image.layout` is set globally.

SVG components [guides page]
- Added astro@5.7.0. Default-import a local .svg and render it as a component. Props such as width, height, fill, and stroke override the file. Type `SvgComponent` from `astro/types`, added 5.14.0.
- Not usable inside UI framework components. Pass as children from an .astro file.

Markdown and MDX
- Standard `![alt](src)` in .md: local src/ paths relative to the file, or an import alias, get optimized. public/ images are not optimized. Remote URLs are processed only if authorized.
- `<Image />` and `<Picture />` are unavailable in .md. Use MDX for them.
- In MDX, Markdown `![]()` works with no import, and `<Image src={imported} />` works with an import.
- Relative paths from content-collection entries outside src/: NOT covered by either page I read. The guides page says only that images can be stored "in any folder, including alongside your content" [summary]. Check the content collections docs.

Content collections [summary]
- Use the `image()` helper in the schema callback, with `z` from `astro/zod`. Frontmatter holds a relative path. Pass `entry.data.cover` straight to `<Image />`.

Remote images and authorization [summary for config keys]
- Config keys named on the guides page: `image.domains` (array of hostnames, e.g. ["astro.build"]) and `image.remotePatterns` (array of { protocol, hostname, pathname, port }, all optional). Remote images not on the allowlist display with no processing, but Image still reserves the space to avoid CLS.
- The configuration-reference page was not read, so I could not verify these keys' exact defaults.

Services and output
- Default service: `image.service` with entrypoint 'astro/assets/services/sharp'. Install `sharp` directly with strict package managers (pnpm). No-op: `passthroughImageService()` from `astro/config` (guides page cites Cloudflare as a case).
- Processed assets cache in ./node_modules/.astro. Override with `cacheDir` [summary].
- Output formats: literals jpeg, jpg, png, webp, svg, avif. Input formats: jpeg, jpg, png, tiff, webp, gif, svg, avif. The page does not list output formats in full.

Caveats
- Image/Picture are unavailable in .md and in UI framework components.
- public/ images are never optimized and are not responsive.
- Remote images need width and height unless inferSize is set.
- Prerendered pages process at build time. On-demand pages process on the fly (guides page).
- Use alt="" for decorative images.
