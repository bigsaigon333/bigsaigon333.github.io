Sources read: https://docs.astro.build/en/guides/integrations-guide/mdx/ (page shows @astrojs/mdx v8.1.5) and https://docs.astro.build/en/guides/integrations/ . Both fetched as non-preapproved, so quotes are kept short. Neither page mentions Astro 7.4 specifically.

Install and setup

- Install: `npx astro add mdx` (pnpm/yarn variants shown). Manual: `npm install @astrojs/mdx`, then add to config (mdx guide).
- Config: `import mdx from '@astrojs/mdx';` then `integrations: [mdx()]` in astro.config.mjs. "no configuration is necessary" for basic .mdx use (mdx guide).
- Integrations guide: integrations go in the `integrations` array; falsy entries are ignored, so `cond && mdx()` works. Upgrade all official integrations with `npx @astrojs/upgrade`.

Markdown inheritance (answers the processor question)

- Default: "all markdown configuration options are inherited by the MDX integration." Options passed to mdx() override them (mdx guide, "Options inherited from Markdown config").
- `processor` (type MarkdownProcessor, default inherited from `markdown.processor`, added in @astrojs/mdx@6.0.0): "By default, .mdx files render through the same Markdown processor as your .md files." (mdx guide)
- Per-MDX processor example: `import { unified } from '@astrojs/markdown-remark';` then `mdx({ processor: unified() })`. Sätteri example: `import { satteri } from '@astrojs/markdown-satteri';` with `mdx({ processor: satteri({ mdastPlugins: [...], features: { gfm: false } }) })`.
- `extendMarkdownConfig` (boolean, default `true`, added 0.15.0). Set `false` to ignore inherited markdown options; the example then uses the default Sätteri processor. (mdx guide)
- `recmaPlugins` is deprecated. Use `unified({ recmaPlugins })` instead. Added in 0.11.5. (mdx guide)
- `optimize` (boolean | { ignoreElementNames?: string[] }, default `false`). Can emit unescaped HTML. Use `ignoreElementNames` for custom components passed via the `components` prop. (mdx guide)
- Caveat: the processor example in the mdx guide shows Sätteri and unified as separate packages, and it doesn't say whether a bare `markdown.processor: satteri(...)` plugin list applies to .mdx in Astro 7 specifically. Check the Sätteri and Unified reference pages before relying on that: https://docs.astro.build/en/reference/markdown-processors/satteri/ and https://docs.astro.build/en/reference/markdown-processors/unified/ (not read).

Glob patterns for md and mdx

- Import `import { glob } from 'astro/loaders';` and `import { defineCollection } from 'astro:content';`
- Example from the mdx guide (src/content.config.ts): `loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/blog" })`
- The mdx guide says the loader must be configured to load `.mdx` files for local MDX in content collections.

Components in .mdx

- Import Astro or framework components at the top of the .mdx file, then use them inline. Framework components need a `client:*` directive, e.g. `<ReactCounter client:load />`. (mdx guide, "Using Components in MDX")
- Map HTML elements to components: `export const components = { blockquote: Blockquote }`. The component must be imported first. Exported components are not used automatically: they must be passed to `<Content>` (mdx guide, Note).
- Collection entries: `import { getEntry, render } from "astro:content";` then `const { Content } = await render(entry);` and `<Content components={{ h1: CustomHeading }} />`. Direct MDX import: `import { Content, components } from '../content.mdx';`
- Exports: `file`, `url`, `frontmatter`, `getHeadings()`, `<Content />` (mdx guide, "Exported Properties")
- MDX syntax is required in .mdx files, not Astro's HTML-like syntax (mdx guide).

Version note: the mdx guide page shows v8.1.5. Astro 7.4 compatibility of @astrojs/mdx is not confirmed by these pages. Check the Astro v7 upgrade guide (https://docs.astro.build/en/guides/upgrade-to/v7/, not read) and the mdx package peer range.

Checked locally in S5.5: `@astrojs/mdx` 8.1.5 peer range is `astro ^7.2.10`, `@astrojs/markdown-satteri ^0.4.0`. A plain `markdown.processor: satteri(...)` is inherited by .mdx, including `mdastPlugins`; a plugin that inserts `{ type: "html" }` nodes then fails in MDX (`mdxjs-rs:raw-html`).
