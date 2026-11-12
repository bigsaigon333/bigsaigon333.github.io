import { getCollection, type CollectionEntry } from "astro:content";

import { SITE } from "./site";

/**
 * 초안인가. 초안은 빌드에 나가지 않는다: 글 페이지도, 홈 목록의 항목도, sitemap 의 주소도 없다.
 *
 * - frontmatter 에 `draft: true` 가 있거나
 * - 파일 이름이 "draft:" 로 시작한다(예전 lib/posts.ts 의 isDraft 와 같은 규칙).
 *   id 가 곧 파일 이름에서 .md 를 뗀 것이다(content.config.ts 의 generateId).
 *
 * posts/draft/ 아래의 파일은 로더가 읽지 않아 여기까지 오지 않는다.
 */
const isDraft = ({ id, data }: CollectionEntry<"posts">): boolean =>
  data.draft === true || /^draft:/i.test(id);

/**
 * 발행된 글 전부. 초안은 빠진다. 날짜 내림차순(같은 날짜면 id 오름차순).
 * 글 페이지, 홈 목록, sitemap 이 모두 이 함수로 글을 얻는다. 컬렉션을 직접 읽으면 초안이 섞인다.
 */
export async function getPublishedPosts(): Promise<CollectionEntry<"posts">[]> {
  const posts = await getCollection("posts", (post) => !isDraft(post));

  return posts.sort(
    (a, b) =>
      b.data.date.valueOf() - a.data.date.valueOf() || a.id.localeCompare(b.id),
  );
}

/** YYYY-MM-DD. UTC 기준이라 빌드 환경의 시간대와 무관하다. */
export const formatDate = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const postPath = (id: string): string => `/posts/${id}`;

export const postUrl = (id: string): string => `${SITE.url}${postPath(id)}`;
