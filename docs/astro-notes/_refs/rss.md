Sources read: https://docs.astro.build/en/recipes/rss/ and https://docs.astro.build/en/guides/endpoints/ (both HTTP 200). Neither page states an Astro 7.4 or @astrojs/rss version, so verify against your installed version. The full option reference lives in the @astrojs/rss README (https://github.com/withastro/astro/tree/main/packages/astro-rss), which I did not fetch.

Install (recipe): `npm install @astrojs/rss` (also pnpm add / yarn add). Set `site` in astro.config (recipe tip).

File and route: create `src/pages/rss.xml.js` (or .ts). The `.xml` in the name gives the URL `/rss.xml`. Endpoints docs: "endpoints whose URLs include a file extension... can only be accessed without a trailing slash... regardless of your build.trailingSlash configuration."

Basic shape (recipe):

- `import rss from '@astrojs/rss';`
- `export function GET(context) { return rss({ ... }); }`
- Keys shown: `title` (the `<title>` field), `description` (the `<description>` field), `site: context.site`, `items: []`, `customData: \`<language>en-us</language>\`` (optional raw XML injected).
- Endpoints docs: GET may be async and returns a Response. Static mode builds at build time. In `static` mode, the page is prerendered by default; SSR (`server` mode) renders on request. In `static` mode, opt out with `export const prerender = false`.

Items from a content collection (recipe):

- `import { getCollection } from 'astro:content';`
- `export async function GET(context) { const blog = await getCollection('blog'); return rss({ ..., items: blog.map((post) => ({ title: post.data.title, pubDate: post.data.pubDate, description: post.data.description, link: \`/blog/${post.id}/\` })) }); }`
- Item fields: `title` (required unless description is set), `description` (required unless title is set), `link` (optional), `pubDate` (optional), `content` (optional full HTML).
- Optional `rssSchema` from `@astrojs/rss`, used as `schema: rssSchema` in defineCollection (src/content.config.ts).
- Full content: set `content` to sanitized HTML from `parser.render(post.body)` (markdown-it + sanitize-html). The recipe says this does not process MDX components. Relative links and images are not handled. Added in astro@1.6.14.

Glob items: `pagesGlobToRssItems(import.meta.glob('./blog/*.{md,mdx}'))`, added in @astrojs/rss@2.1.0. Passing the raw glob to `items` is deprecated.

customData: a raw XML string, e.g. `<language>en-us</language>` (recipe example). The recipe does not describe other customData behavior.

stylesheet: `rss({ stylesheet: '/rss/styles.xsl', ... })` takes an absolute path. The recipe suggests putting the file in `public/` (e.g. the Pretty Feed v3 XSL).

Trailing slash (recipe): "Astro's RSS feed produces links with a trailing slash by default, no matter what value you have configured for trailingSlash." If `trailingSlash: "never"` is set in astro.config, set `trailingSlash: false` in `rss()`. Example: `trailingSlash: false,`.

Head autodiscovery (recipe): add to the head:
`<link rel="alternate" type="application/rss+xml" title="Your Site's Title" href={new URL("rss.xml", Astro.site)} />`

Caveats:

- The recipe's `link` example `/blog/${post.id}/` has a trailing slash, which matches the default feed behavior.
- Using `pagesGlobToRssItems` assumes frontmatter is valid and does not verify it.
- The recipe does not show `xmlns` or other rss() options. Check the README.

Quote note: the recipe page is a non-preapproved source, so quotes above are short and few.
