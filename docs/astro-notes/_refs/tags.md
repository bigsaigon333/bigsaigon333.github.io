# 문서 요약: tags

> 문서 스카우트가 공식 문서를 읽고 요약한 것이다. 요약과 실제 동작이 다르면 실제 동작을 따르고 학습 노트에 적는다.

Astro docs summary (Astro 7.x docs as served 2026-11-13; I did not verify against 7.4 specifically). Sources: R = https://docs.astro.build/en/guides/routing/ ; C = https://docs.astro.build/en/guides/content-collections/ ; K = https://docs.astro.build/en/reference/configuration-reference/ ; RR = https://docs.astro.build/en/reference/routing-reference/

## Dynamic routes and getStaticPaths

- File name `src/pages/posts/[id].astro` defines param `id`. `getStaticPaths()` must return `[{ params: { id: '1' } }, ...]`; each `params` key must match the bracket name. Read with `Astro.params`. (R, RR)
- Optional `props` on each item, read with `Astro.props`. Props are not URL-encoded and need not be strings. (RR)
- Rest param `[...slug].astro` matches any depth. `{ params: { slug: undefined } }` builds the top-level page. (R)
- Multiple params can be used in one file name (`[lang]-[version]`) or in separate segments (`[lang]/[version]`). (R)
- Caution: `getStaticPaths()` runs once in its own isolated scope. It cannot reference parent-scope variables, only file imports. (RR)
- Encoding: RR says "`params` are encoded into the URL, so only strings are supported as values." R says returned params "are not decoded. Use `decodeURI()` when you need to decode parameter values." Neither page states how non-ASCII or space characters become file paths or URLs. Treat that as unverified and check the built `dist/` output.
- Prerender conflict: `prerenderConflictBehavior` (K, added in 6.0) is `'error' | 'warn' | 'ignore'`, default `'warn'`. It applies when two routes produce the same URL.

## build.format (K, "Build Options")

- `build.format`, type `'file' | 'directory' | 'preserve'`. The default is `'directory'`, but I took this from a model-extracted summary, not verbatim text; verify it.
- `'file'`: `/about.html`. `'directory'`: `/about/index.html`. `'preserve'`: mirrors the source layout.
- It also sets `Astro.url`. K advises `trailingSlash: 'always'` with `directory`, or `'never'` with `file`.
- `trailingSlash` (K, top-level): type `'always' | 'never' | 'ignore'`, default `'ignore'` (verbatim). K says prerendered-page trailing slashes are handled by the host, not by Astro.

## Content collections (C)

- Imports: `import { defineCollection } from "astro:content";`, `import { glob, file } from "astro/loaders";`, `import { z } from "astro/zod";`. Query imports: `import { getCollection, getEntry, render } from "astro:content";`
- Config lives in `src/content.config.ts`; export `collections`. Example: `loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' })`.
- Route pattern from the page: in `src/pages/posts/[id].astro`, `getStaticPaths` does `getCollection('blog')`, then returns `{ params: { id: post.id }, props: { post } }`. Render with `const { Content } = await render(post);`. Entry `hello-world` serves at `/posts/hello-world/`.
- `id` comes from the filename, lowercased by default. Override with `generateId` in `glob()`, or a frontmatter `slug` field. Multi-segment IDs need `[...id].astro`. (C)
- Filter drafts with a callback, for example `getCollection('blog', ({ data }) => data.draft !== true)`. (C)
- Ordering: the page says `getCollection()` order is non-deterministic and platform-dependent, so sort explicitly. This came from the summary; verify.
- Tag lists: C gives no guidance on deriving tags. Use plain JS on the returned entries, for example `[...new Set(posts.flatMap(p => p.data.tags ?? []))]`. This is my own suggestion, not from the docs.
