// /rss.xml — RSS 2.0 피드. sitemap.xml.ts 와 같은 정적 엔드포인트이고, XML 은 @astrojs/rss 가 만든다.
// 확장자가 있는 엔드포인트라 trailingSlash 설정과 상관없이 슬래시 없는 /rss.xml 로만 나간다.
import rss from "@astrojs/rss";
import type { APIRoute } from "astro";

import { getPublishedPosts, postUrl } from "../lib/posts";
import { SITE } from "../lib/site";

export const GET = (async () => {
  // 초안은 빠지고 날짜 내림차순(최신 글 먼저)이다. sitemap 과 같은 함수로 얻는다.
  const posts = await getPublishedPosts();

  return rss({
    title: SITE.title,
    description: SITE.description,
    // channel 의 <link>. trailingSlash: false 라 "https://bigsaigon333.github.io" 로 끝 슬래시 없이 나간다.
    site: SITE.url,
    // 기본값(true)은 상대 경로 link 끝에 "/" 를 붙인다. 이 사이트의 canonical 에는 슬래시가 없다.
    trailingSlash: false,
    customData: `<language>${SITE.lang}</language>`,
    items: posts.map((post) => ({
      title: post.data.title,
      // 절대 URL 은 @astrojs/rss 가 손대지 않는다. 글 페이지의 canonical·sitemap 의 <loc> 과 같은 문자열이다.
      link: postUrl(post.id),
      // date 는 UTC 자정의 Date. RFC 822 문자열(toUTCString)로 나간다.
      pubDate: post.data.date,
      // description 이 빈 글(summary 도 없는 글)은 <description> 을 내지 않는다.
      description: post.data.description || undefined,
    })),
  });
}) satisfies APIRoute;
