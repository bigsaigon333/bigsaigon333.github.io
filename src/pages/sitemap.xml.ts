// /sitemap.xml — 정적 엔드포인트. 파일 이름에서 ".ts" 만 떨어져 dist/sitemap.xml 이 된다.
// 빌드할 때 GET 이 한 번 불리고, 돌려준 Response 의 본문이 그대로 파일 내용이 된다.
import type { APIRoute } from "astro";

import { formatDate, getPublishedPosts, postUrl } from "../lib/posts";
import { SITE } from "../lib/site";

const escapeXml = (text: string): string =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** lastmod 는 YYYY-MM-DD. 없으면 요소를 내지 않는다. */
const urlElement = (loc: string, lastmod?: string): string =>
  `<url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`;

export const GET = (async () => {
  const posts = (await getPublishedPosts()).map((post) => ({
    loc: postUrl(post.id),
    lastmod: formatDate(post.data.date),
  }));

  // 홈은 글 목록이므로 가장 최근 글의 날짜를 쓴다. YYYY-MM-DD 는 문자열 순서가 곧 날짜 순서다.
  const newest = posts
    .map((post) => post.lastmod)
    .sort()
    .at(-1);

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    urlElement(SITE.url, newest),
    ...posts.map((post) => urlElement(post.loc, post.lastmod)),
    `</urlset>`,
    "",
  ].join("\n");

  // 정적 빌드에서는 헤더가 버려지고 파일에는 본문만 남는다. astro dev 가 응답할 때만 쓰인다.
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}) satisfies APIRoute;
