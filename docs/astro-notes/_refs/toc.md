Astro 7.4 facts (3 pages read; URLs below). The docs do not pin Sätteri-specific slug rules, and the markdown-content page's "Modifying frontmatter" section was cut off, so those items rest on a model summary and are flagged.

**render()** (https://docs.astro.build/en/reference/modules/astro-content/#render, "Added in astro@5.0.0")

- Signature: `(entry: CollectionEntry) => Promise<RenderResult>`
- Returns `<Content />`, `headings` ("A generated list of headings, mirroring Astro's getHeadings()"), and `remarkPluginFrontmatter` (typed `any`, the frontmatter after Markdown processor plugins).
- Usage: `import { getEntry, render } from 'astro:content';` then `const { Content, headings, remarkPluginFrontmatter } = await render(entry);`
- Headings shape, from getHeadings() (https://docs.astro.build/en/guides/markdown-content/#available-properties): `{ depth: number; slug: string; text: string }[]`. Includes h1 to h6. The guide says `slug` is the generated heading ID.

**Heading IDs** (https://docs.astro.build/en/guides/markdown-content/#heading-ids)

- "Astro generates heading `id`s based on `github-slugger`." Stated generally, not scoped to Sätteri.
- Astro injects `id` on h1 to h6 after custom plugins run, so a plugin-set ID (e.g. rehype-slug) is preserved and shows up in getHeadings().
- To let plugins read Astro's IDs, place the ID plugin first. Sätteri: `import { satteri, satteriHeadingIdsPlugin } from '@astrojs/markdown-satteri';` with `markdown: { processor: satteri({ hastPlugins: [satteriHeadingIdsPlugin(), ...] }) }`. Unified: `import { unified, rehypeHeadingIds } from '@astrojs/markdown-remark';` with `rehypePlugins: [rehypeHeadingIds, ...]`.

**Processor** (https://docs.astro.build/en/guides/markdown-content/#markdown-processors)

- "Added in: astro@6.4.0". Since Astro v7, Sätteri is the default. Works with no install or config.
- Explicit config needs `npm install @astrojs/markdown-satteri` and `markdown.processor: satteri({...})`. Options include `mdastPlugins`, `hastPlugins`, `features: { gfm: false }`, and `features: { smartPunctuation: false }`.
- Unified needs `@astrojs/markdown-remark` and `unified({...})` with `remarkPlugins` / `rehypePlugins`.

**remarkPluginFrontmatter** (guide section "Modifying frontmatter programmatically", not read in full): the reference says it is the frontmatter "after Markdown processor plugins have been applied." A model summary of the cut-off text says plugins write to `ctx.data.astro.frontmatter` (Sätteri) and that the object "already contains all properties." Unverified against the verbatim text.

**Reading time** (https://docs.astro.build/en/recipes/reading-time/, read in full)

- Packages: `reading-time`, `@astrojs/markdown-satteri`, `satteri` (Sätteri). `reading-time`, `mdast-util-to-string`, `@astrojs/markdown-remark` (Unified).
- Sätteri plugin: `import getReadingTime from "reading-time"; import { defineMdastPlugin } from "satteri";` using `after(root, context)` with `context.textContent(root)`, then `context.data.astro.frontmatter.minutesRead = readingTime.text;` (guarded by `if (context.data.astro !== undefined)`).
- Config: `markdown: { processor: satteri({ mdastPlugins: [mdastReadingTimePlugin] }) }`.
- Unified: `remarkPlugins: [remarkReadingTime]`, which sets `data.astro.frontmatter.minutesRead`.
- Display: `const { Content, remarkPluginFrontmatter } = await render(entry);` then `{remarkPluginFrontmatter.minutesRead}`. Layouts read `Astro.props.frontmatter.minutesRead`.
- Output: a string such as "3 min read". The key name `minutesRead` is the recipe's choice.

**Not found**: the docs say nothing on Sätteri-specific slug rules, remarkPluginFrontmatter typing beyond `any`, or the headings type inside render() beyond "mirroring getHeadings()".
