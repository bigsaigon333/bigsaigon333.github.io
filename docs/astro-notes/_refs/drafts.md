Astro docs summary (Korean/English mix). Sources: https://docs.astro.build/en/guides/content-collections/ (first ~40k chars read verbatim, rest from a model-extracted summary, flagged [S]) and https://docs.astro.build/en/guides/environment-variables/ (read verbatim). Neither page states a version, so I could not confirm these apply to Astro 7.4 specifically. The site has a v7.0 upgrade guide, so these are current docs.

**glob() loader (content-collections)**

- Import: `import { glob, file } from 'astro/loaders';` (also `import { defineCollection } from 'astro:content';`, `import { z } from 'astro/zod';`). Config file: `src/content.config.ts` (`.js`/`.mjs` also supported). Export `export const collections = { blog };`
- Keys: `pattern` (micromatch glob) and `base` (directory path). Example: `glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' })`.
- Supports Markdown, MDX, Markdoc, JSON, YAML, TOML.
- Default ID: generated from filename, lowercased. Override per entry with `slug` frontmatter/JSON field, or via `generateId: ({ entry }) => entry.replace(/\.json$/, "")` (keeps uppercase).
- The page does not document defaults for `pattern`/`base`. Treat them as required.
- Source: content-collections, "The glob() loader" and "Defining custom IDs" sections.

**file() loader**

- `import { file } from 'astro/loaders'`; `file('src/data/dogs.json')`. Takes a JSON/YAML array (each needs `id`) or object keyed by id; TOML top-level tables become entries. Does NOT auto-generate IDs. Custom formats use `file(path, { parser: (text) => ... })`.

**getCollection filter (content-collections) [S]**

- Optional second argument is a filter callback returning boolean, e.g. `({ data }) => data.draft !== true`. Filter on `id` for folder scoping, e.g. `({ id }) => id.startsWith('en/')`.
- Page does not say whether getEntry() accepts a filter.
- Sort order is non-deterministic; sort yourself (e.g. by `data.pubDate`). [S]

**Environment-based filtering (content-collections) [S]**

- Page uses `import.meta.env.PROD` to hide drafts only in production, returning `true` in dev so drafts stay visible. It does not mention `import.meta.env.DEV`.

**import.meta.env (environment-variables, verbatim)**

- Built-ins: `import.meta.env.MODE` ("development" for `astro dev`, "production" for `astro build`); `import.meta.env.PROD` (true in production, false otherwise); `import.meta.env.DEV` ("Always the opposite of `import.meta.env.PROD`"); `import.meta.env.BASE_URL` (from `base` config); `import.meta.env.SITE` (from `site` config).
- Vite static replacement: env values are "statically replaced at build time".
- `.env` files: `.env`, `.env.production`, `.env.development`, or custom mode `.env.staging`. Run with `--mode staging` (e.g. `astro dev --mode staging`, `astro build --mode testing`). `astro build --devOutput` builds in dev-style output.
- Only `PUBLIC_`-prefixed vars reach client code. Example: `PUBLIC_POKEAPI=...` is available everywhere; `DB_PASSWORD` is server-only.
- `.env` files are NOT loaded inside `astro.config.*`. Use `process.env` there, or Vite's `loadEnv`. Vite `loadEnv` needs `pnpm add -D vite` under pnpm.
- Types: add `src/env.d.ts` with `interface ImportMetaEnv { readonly ... }` and `interface ImportMeta { readonly env: ImportMetaEnv; }`.
- `astro:env` (`env.schema` in config, `envField.string/number/boolean/enum`, imports from `astro:env/client` and `astro:env/server`) is a virtual module, usable only in the Astro context, not in `astro.config.mjs` or plain scripts.

**Dev-only pages (not covered by either page)**

- Neither page documents dev-only routes. The closest approach is a `import.meta.env.DEV` or `PROD` check, but this is inferred, not from these docs. Verify against the routing docs (https://docs.astro.build/en/guides/routing/) if needed. I did not fetch them.

Caveat: `import.meta.env.DEV`/`PROD` are inlined at build time, so a `PROD`-gated branch is dead-code-eliminated in builds. This follows from "statically replaced" and is my inference.
