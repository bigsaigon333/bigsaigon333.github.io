# Astro content collections: file() loader, reference(), getEntry/getEntries

Sources read: https://docs.astro.build/en/guides/content-collections/ (the first 39,936 of 73,596 characters were read verbatim; the rest is a model-extracted summary) and https://docs.astro.build/en/reference/modules/astro-content/ (read in full). Neither page pins the APIs to a version. The reference page says `reference()` was added in astro@2.5.0, `getEntry`/`getEntries` in 2.5.0, and `defineCollection`/`loader` in 2.0.0/5.0.0. The guide's file() section has no version tag. I could not confirm anything specific to 7.4. The upgrade guide at /en/guides/upgrade-to/v7/ was not fetched.

**file() loader (JSON/YAML)**

- Import: `import { file } from "astro/loaders";` (the guide's collection-level example imports `glob, file` from the same path). Usage: `loader: file("src/data/dogs.json"),` inside `defineCollection()`, with the collection exported from `src/content.config.ts`. [guide]
- It auto-parses a single array of objects from JSON and YAML files. Each top-level TOML table becomes one entry. [guide]
- Every entry needs a unique `id` property. Unlike `glob()`, `file()` does not generate IDs. Two shapes are accepted: an array of objects with `"id"`, or an object keyed by id. [guide]
- Nested JSON (for example `{"dogs":[...],"cats":[...]}`) needs one `file()` per collection with a custom `parser: (text) => JSON.parse(text).dogs`. [guide]
- Other formats (for example CSV) need `file(path, { parser: (text) => ... })`. The guide's CSV example uses `csv-parse`. [guide]
- Caveat: the guide gives no further options or defaults for `file()`.

**reference() between collections**

- Import: `import { defineCollection, reference } from 'astro:content';`. Usage in the schema (`z` from `astro/zod`): `author: reference('authors'),` and `relatedPosts: z.array(reference('blog')),`. [reference]
- Type: `(collection: CollectionKey) => ZodEffects<ZodString, { collection: CollectionKey, id: string }>`. The stored value is a plain id string in frontmatter. The parsed value is an object `{ collection, id }`. [reference, guide]
- Validation: "Validation of referenced entries happens at runtime when using `getEntry()` or `getEntries()`". [reference]
- If a referenced entry is invalid, `getEntries()` puts `undefined` in that array slot. The example comment reads: "if a referenced entry is invalid, the array will contain undefined". [reference]
- Schema violations in ordinary entries produce a build error. The guide says "Astro will provide a helpful error". It does not say reference targets are checked at build time. [guide]

**getEntry()**

- Import: `import { getEntry } from "astro:content";`
- Signatures: `getEntry(collection: CollectionKey, id: string): Promise<CollectionEntry | undefined>` and `getEntry({ collection, id }): Promise<CollectionEntry | undefined>`. [reference]
- Returns `undefined` when not found, so guard it: `if (!entry) throw new Error(...)`. [reference]
- Accepts a reference object directly: `getEntry(enterprisePost.data.captain)`. [reference]

**getEntries()**

- Import: `import { getEntries } from "astro:content";`
- Takes an array of `{ collection, id }` objects, usually a reference field: `getEntries(enterprisePost.data.relatedPosts)`. [reference]
- The reference page lists the return type as `CollectionEntry[]` with no `Promise`, but its examples use `await`. Treat it as async and check the types in your editor. [reference]

**Other facts**

- `CollectionEntry` has `id`, `collection`, `data`, `body`, `rendered`, `filePath`. `render(entry)` returns `{ Content, headings, remarkPluginFrontmatter }`. [reference]
- `CollectionKey` is the union of collection names, useful for typing helper functions. [reference]
- The `glob()` loader's ID generation is slugified and lowercased by default. The `file()` loader skips this. [guide, reference]
