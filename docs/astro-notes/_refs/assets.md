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
