import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { load, type CheerioAPI } from "cheerio";
import { beforeAll, describe, expect, test } from "vitest";

import Seo from "../src/components/Seo.astro";
import { SITE } from "../src/lib/site";

// Seo 의 렌더링 결과(HTML)만 본다. 토큰·설정을 어디서 읽는지 같은 속은 보지 않는다.
let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});

// Seo.astro 의 Props 와 같은 모양. 시험은 이 값을 그대로 props 로 넘긴다.
type Props = {
  title: string;
  description: string;
  url: string;
  type: "website" | "article";
  keywords: string[];
  publishedTime?: Date;
  noindex?: boolean;
};

const render = async (props: Props): Promise<CheerioAPI> =>
  load(await container.renderToString(Seo, { props }));

const meta = ($: CheerioAPI, property: string): string[] =>
  $(`meta[property="${property}"]`)
    .map((_, el) => $(el).attr("content"))
    .get();

const jsonLd = ($: CheerioAPI): unknown[] =>
  $('script[type="application/ld+json"]')
    .map((_, el) => JSON.parse($(el).html() ?? ""))
    .get();

const home: Props = {
  title: SITE.title,
  description: SITE.description,
  url: SITE.url,
  type: "website",
  keywords: SITE.keywords,
};

const postUrl = `${SITE.url}/posts/proxy`;
const post: Props = {
  title: "내장 객체에 Proxy 를 </script> 적용하기",
  description: "Proxy 로 Map 을 감싼다",
  url: postUrl,
  type: "article",
  keywords: ["Proxy", "built-in object", "자바스크립트"],
  publishedTime: new Date("2022-05-08"),
};

describe("Seo: 홈", () => {
  test("og:type 은 website, canonical 은 사이트 주소", async () => {
    const $ = await render(home);
    expect(meta($, "og:type")).toEqual(["website"]);
    expect($('link[rel="canonical"]').attr("href")).toBe(SITE.url);
    expect(meta($, "og:url")).toEqual([SITE.url]);
  });

  test("article:* 태그가 없다", async () => {
    const $ = await render(home);
    expect($('meta[property^="article:"]')).toHaveLength(0);
  });

  test("JSON-LD 는 WebSite 하나", async () => {
    const $ = await render(home);
    expect(jsonLd($)).toEqual([
      expect.objectContaining({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: SITE.title,
        url: SITE.url,
        inLanguage: "ko",
      }),
    ]);
  });

  test("홈이 아닌 website 페이지(404)는 JSON-LD 가 없고 noindex 다", async () => {
    const $ = await render({
      ...home,
      url: `${SITE.url}/404`,
      noindex: true,
    });
    expect(jsonLd($)).toEqual([]);
    expect($('meta[name="robots"]').attr("content")).toBe("noindex, follow");
  });
});

describe("Seo: 글", () => {
  test("og:type 은 article, canonical 은 글 주소", async () => {
    const $ = await render(post);
    expect(meta($, "og:type")).toEqual(["article"]);
    expect($('link[rel="canonical"]').attr("href")).toBe(postUrl);
    expect($('meta[name="robots"]').attr("content")).toMatch(/^index, follow/);
  });

  test("article:published_time 과 키워드마다 article:tag", async () => {
    const $ = await render(post);
    expect(meta($, "article:published_time")).toEqual([
      "2022-05-08T00:00:00.000Z",
    ]);
    expect(meta($, "article:tag")).toEqual(post.keywords);
  });

  test("JSON-LD 는 파싱되는 BlogPosting, 제목의 </script> 가 스크립트를 끊지 않는다", async () => {
    const $ = await render(post);
    const [data, ...rest] = jsonLd($);
    expect(rest).toEqual([]);
    expect(data).toMatchObject({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: "2022-05-08T00:00:00.000Z",
      url: postUrl,
      mainEntityOfPage: { "@type": "WebPage", "@id": postUrl },
      keywords: post.keywords,
    });
    expect($('script[type="application/ld+json"]').html()).not.toContain("<");
  });

  test("빈 description 과 빈 keywords 는 JSON-LD 에서 키째로 빠진다", async () => {
    const $ = await render({ ...post, description: "", keywords: [] });
    const [data] = jsonLd($);
    expect(data).not.toHaveProperty("description");
    expect(data).not.toHaveProperty("keywords");
    expect($('meta[property="article:tag"]')).toHaveLength(0);
  });
});

describe("Seo: 공통", () => {
  test("keywords 는 쉼표+공백으로 잇는다", async () => {
    const $ = await render(post);
    expect($('meta[name="keywords"]').attr("content")).toBe(
      "Proxy, built-in object, 자바스크립트",
    );
  });

  test("RSS alternate 링크는 사이트 절대 주소의 /rss.xml", async () => {
    for (const props of [home, post]) {
      const $ = await render(props);
      const rss = $('link[rel="alternate"][type="application/rss+xml"]');
      expect(rss).toHaveLength(1);
      expect(rss.attr("href")).toBe(`${SITE.url}/rss.xml`);
      expect(rss.attr("title")).toBe(SITE.title);
    }
  });

  test("<title>, og:title, twitter:title 이 같다", async () => {
    const $ = await render(post);
    expect($("title").text()).toBe(post.title);
    expect(meta($, "og:title")).toEqual([post.title]);
    expect($('meta[name="twitter:title"]').attr("content")).toBe(post.title);
  });
});
