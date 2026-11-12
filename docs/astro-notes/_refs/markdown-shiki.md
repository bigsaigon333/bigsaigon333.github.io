Astro 7.4 Markdown and syntax highlighting summary (3 pages read; config table facts come from a model-extracted summary, not verbatim text)

**Markdown processors**
- Sätteri is the default since Astro v7; unified is the older pipeline. Added in astro@6.4.0 (https://docs.astro.build/en/guides/markdown-content/)
- Config key: `markdown.processor`. Sätteri: `import { satteri } from "@astrojs/markdown-satteri"`, then `processor: satteri()`. Unified: `import { unified } from "@astrojs/markdown-remark"`, then `processor: unified()`. Install the matching package. Sätteri works with no install or config by default. (https://docs.astro.build/en/guides/markdown-content/)
- Use Unified if you need remark/rehype plugins or recma plugins in MDX. (https://docs.astro.build/en/guides/markdown-content/)
- GFM is on by default. Disable with `satteri({ features: { gfm: false } })` or `unified({ gfm: false })`. (https://docs.astro.build/en/guides/markdown-content/)
- Footnotes: Sätteri `features.gfm.footnotes` with `backContent`, `backLabel`, `label`. Unified `remarkRehype` with `footnoteBackContent`, `footnoteBackLabel`, `footnoteLabel`. (https://docs.astro.build/en/guides/markdown-content/)
- Smart punctuation (smartypants) is on by default. Sätteri: `features: { smartPunctuation: false }` or an object `{ quotes, dashes, ellipses }`. Unified: `smartypants: false` or the same object. (https://docs.astro.build/en/guides/markdown-content/)
- Heading IDs: Astro generates them with github-slugger and injects them after custom plugins run. To run plugins that need IDs first, use Sätteri `satteriHeadingIdsPlugin()` from `@astrojs/markdown-satteri` in `hastPlugins`, or Unified `rehypeHeadingIds` from `@astrojs/markdown-remark` in `rehypePlugins`. (https://docs.astro.build/en/guides/markdown-content/)
- Plugins: Sätteri takes `mdastPlugins` and `hastPlugins`. Unified takes `remarkPlugins` and `rehypePlugins`, with options as `[plugin, opts]`. (https://docs.astro.build/en/guides/markdown-content/)
- Caveats: Astro no longer adds `<meta charset="utf-8">` for pages using the frontmatter `layout` property. (https://docs.astro.build/en/guides/markdown-content/)
- Math/KaTeX, raw HTML: not covered in the fetched markdown page (excerpt was truncated). Config summary shows `markdown.syntaxHighlight.excludeLangs` defaults to `['math']`, which implies a math code-fence convention, but no KaTeX plugin is documented in what I read. Sätteri's own reference page (https://docs.astro.build/en/reference/markdown-processors/satteri/) was not fetched.

**Config keys** (https://docs.astro.build/en/reference/configuration-reference/, from summary)
- `markdown.processor` (added 6.4.0; Sätteri default)
- `markdown.syntaxHighlight`: `'shiki' | 'prism' | false`. Default `{ type: 'shiki', excludeLangs: ['math'] }`
- `markdown.shikiConfig`: `theme`, `themes`, `defaultColor`, `langs`, `langAlias`, `wrap`, `transformers`
- Deprecated, pass to processor instead: `remarkPlugins`, `rehypePlugins`, `gfm` (default true), `smartypants` (default true), `remarkRehype`

**Shiki syntax highlighting** (https://docs.astro.build/en/guides/syntax-highlighting/)
- Default theme: `github-dark`. Output is inline styles only, no extra CSS or JS.
- Single theme: `markdown.shikiConfig.theme: 'dracula'`. A custom theme can be a JSON import passed as `theme`.
- Dual themes: `shikiConfig.themes: { light: 'github-light', dark: 'github-dark' }`.
- CSS variables: dark-mode rules target `.astro-code` (not `.shiki`) and `--shiki-dark`, `--shiki-dark-bg`, `--shiki-dark-font-style`, etc. With the `css-variables` theme, the prefix is `--astro-code-`. Shiki's dual-theme docs (https://shiki.style/guide/dual-themes) are the reference for the query/class toggle.
- Transformers: `import { transformerNotationFocus, transformerMetaHighlight } from '@shikijs/transformers'`. Transformers only add classes; you write the CSS.

**`<Code />`** (https://docs.astro.build/en/guides/syntax-highlighting/)
- Import: `import { Code } from 'astro:components'`
- Props: `code`, `lang`, `theme`, `embeddedLangs` (added 6.0.0), `transformers` (added 4.11.0), `meta` (string, added 4.14.0), `wrap`, `inline`, `defaultColor`
- Caveat: `<Code />` does NOT inherit `markdown.shikiConfig`. Set theme props explicitly.

**Prism** (same URL): `import { Prism } from '@astrojs/prism'` (install `@astrojs/prism`). Needs your own Prism CSS. Enabled globally with `markdown.syntaxHighlight: 'prism'`.
