import { getVisiblePosts, type Post } from "./posts";
import { SITE } from "./site";

/**
 * 태그 = 글 frontmatter 의 keywords 한 항목. 태그 페이지의 주소는 아래 규칙의 슬러그로 만든다.
 *
 * 슬러그 규칙(docs/astro-notes/16-tag-pages.md):
 *   1. NFKC 로 정규화한다(전각 "ＣＳＳ" → "CSS", 한글은 완성형 그대로).
 *   2. 소문자로 바꾼다(유니코드 규칙, 한글은 그대로).
 *   3. 글자(\p{L})·숫자(\p{N})·결합 부호(\p{M})가 아닌 것이 이어지면 "-" 하나로 바꾼다. 공백, 구두점, 기호가 모두 여기에 든다.
 *   4. 앞뒤의 "-" 를 뗀다.
 * 예: "void 요소" → "void-요소", "built-in object" → "built-in-object", "Proxy" → "proxy", "요소vs태그" → "요소vs태그".
 *
 * 한글은 그대로 둔다. 주소창에는 그대로 보이고, href 와 sitemap 에는 퍼센트 인코딩해서 쓴다(tagPath, tagUrl).
 * 서로 다른 키워드가 같은 슬러그가 되면(예: "CSS" 와 "css", "C++" 와 "C#") 한쪽이 다른 쪽의 페이지를 조용히 덮지 않도록
 * 빌드를 멈춘다(getTags). 슬러그가 비는 키워드(구두점뿐)도 멈춘다.
 */
export const tagSlug = (keyword: string): string =>
  keyword
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

/** 사이트 안 주소. 슬러그를 퍼센트 인코딩한다("/tags/void-%EC%9A%94%EC%86%8C"). */
export const tagPath = (keyword: string): string =>
  `/tags/${encodeURIComponent(tagSlug(keyword))}`;

export const tagUrl = (keyword: string): string =>
  `${SITE.url}${tagPath(keyword)}`;

export const TAGS_PATH = "/tags";

export interface Tag {
  slug: string;
  /** 화면에 보이는 이름: frontmatter 에 적힌 키워드 그대로. */
  label: string;
  /** 날짜 내림차순(getVisiblePosts 의 순서). */
  posts: Post[];
}

/**
 * 모든 태그, 이름 순(한국어 정렬). 운영 빌드에서는 발행된 글만 태그를 낸다: 초안의 키워드는 태그가 되지 않는다.
 * astro dev 에서는 글 페이지처럼 초안도 섞인다(초안 글 페이지의 태그 링크가 깨지지 않게).
 */
export async function getTags(): Promise<Tag[]> {
  const posts = await getVisiblePosts();
  const tags = new Map<string, Tag>();

  for (const post of posts) {
    for (const keyword of new Set(post.data.keywords)) {
      const slug = tagSlug(keyword);
      if (slug === "")
        throw new Error(
          `태그 "${keyword}"(${post.id})의 슬러그가 비었다. 글자나 숫자를 하나 이상 넣는다`,
        );
      const tag = tags.get(slug);
      if (tag === undefined)
        tags.set(slug, { slug, label: keyword, posts: [post] });
      // NFC 로 비교한다: 조합형(NFD)과 완성형으로 적힌 같은 한글은 같은 태그다.
      else if (tag.label.normalize("NFC") !== keyword.normalize("NFC"))
        throw new Error(
          `태그 "${tag.label}"(${tag.posts[0]?.id})와 "${keyword}"(${post.id})가 같은 주소 /tags/${slug} 가 된다. 한쪽 표기로 맞춘다`,
        );
      else tag.posts.push(post);
    }
  }

  return [...tags.values()].sort(
    (a, b) => a.slug.localeCompare(b.slug, "ko") || (a.slug < b.slug ? -1 : 1),
  );
}
