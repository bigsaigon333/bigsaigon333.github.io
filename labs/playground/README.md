# labs/playground

A separate Astro 7.4 project for trying server features (on-demand rendering, endpoints,
middleware, sessions …) next to the blog without touching it. It is **not deployed** and never
reaches `main`: the release script removes `labs/` and fails if anything mentions it.

## Commands

Run from the repository root (or drop `--prefix labs/playground` inside this directory).

| Command                                                     | What it does                                             |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| `npm ci --prefix labs/playground`                           | install the lab's own dependencies (its own lockfile)    |
| `npm --prefix labs/playground run verify`                   | build, start the server, run every case, ALL PASS/FAILED |
| `npm --prefix labs/playground run verify -- --no-build`     | reuse the last `dist/`                                   |
| `npm --prefix labs/playground run verify -- --only=s81,s84` | run only those case files                                |
| `npm --prefix labs/playground run check`                    | `astro check`, must report 0 errors                      |
| `npm --prefix labs/playground run dev`                      | dev server                                               |

Browser cases use **Playwright from the repository root's `node_modules`** (`npm ci` at the root;
Node finds it by walking up from `verify/`). That reuses the blog's pinned Playwright and its
already-installed Chromium instead of a second copy here. HTTP-only cases do not need it: the
browser is launched only when a case first calls `browser()`.

## Base setup (S8.1)

- `output: "static"` with `@astrojs/node` in `standalone` mode. Pages and endpoints are
  prerendered unless they export `prerender = false`.
- `verify/run.mjs` builds, starts `dist/server/entry.mjs` with `HOST=127.0.0.1` and a free
  `PORT`, waits for it, and runs the cases.

## The contract for demos S8.2 – S8.5

Each demo owns only these paths (`<demo>` is `s82`, `s83`, `s84` or `s85`):

| Path                  | Owner     | Notes                                                    |
| --------------------- | --------- | -------------------------------------------------------- |
| `config/<demo>.mjs`   | that demo | `export default { … }`, deep-merged into the base config |
| `src/pages/<demo>/**` | that demo | its URLs live under `/<demo>/`                           |
| `src/<demo>/**`       | that demo | its modules and components                               |
| `verify/<demo>.mjs`   | that demo | its cases                                                |
| `src/middleware.ts`   | S8.4      | a pass-through `sequence()` today; append handlers       |
| `src/fetch.ts`        | S8.5      | only if needed                                           |
| everything else       | S8.1      | ask instead of editing (list it as a need)               |

Config merge (`astro.config.mjs`): seams merge in order s82 → s85. Plain objects merge key by
key, arrays concatenate (`integrations`, `vite.plugins`), other values are replaced by the later
seam. Do not set `adapter` or `output` in a seam.

A case file:

```js
export const cases = [
  {
    name: "what it proves",
    async run({ base, request, browser, dist }) {
      const res = await request("/s82/thing"); // fetch(new URL(path, base), { redirect: "manual" })
      // throw (e.g. node:assert) to fail; return to pass
    },
  },
];
```

- `base`: the server origin. `request(path, init)`: `fetch` with `redirect: "manual"`.
- `browser()`: a shared Playwright Chromium `Browser`; open your own `newContext()` and close it.
- `dist`: absolute `dist/` path (`dist/client` holds prerendered files).
- One process serves every demo, so server state (in-memory stores, cookies by path) must be
  scoped to your demo's paths. Each case has a 30 s timeout.
- Files starting with `_` in `verify/` are helpers and are not loaded as case files.

The lab is formatted by the root Prettier (`npx prettier --check .` at the root covers it) and is
excluded from the root oxlint and TypeScript configs; its type check is `npm run check` here.
