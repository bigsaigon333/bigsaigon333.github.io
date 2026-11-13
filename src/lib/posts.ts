import { getCollection, type CollectionEntry } from "astro:content";

import { SITE } from "./site";

/** 페이지로 그리는 글. 발행된 글(posts)이거나 posts/draft/ 의 초안(drafts, dev 에서만)이다. */
export type Post = CollectionEntry<"posts"> | CollectionEntry<"drafts">;

/**
 * 초안인가. 초안은 운영 빌드에 나가지 않는다: 글 페이지도, 홈 목록의 항목도, sitemap 의 주소도 없다.
 * astro dev 에서는 글 페이지와 홈 목록에 "[초안]" 표시와 함께 나온다. sitemap 에는 dev 에서도 없다.
 *
 * - posts/draft/ 아래에 있거나(drafts 컬렉션. 운영 빌드에서는 비어 있다)
 * - frontmatter 에 `draft: true` 가 있거나
 * - 최상위 파일의 이름이 "draft:" 로 시작한다(예전 규칙. 검증 장치가 이 이름을 초안으로 보므로 함께 지킨다).
 *   id 가 곧 파일 이름에서 .md 를 뗀 것이다(content.config.ts 의 generateId).
 */
export const isDraft = (post: Post): boolean =>
  post.collection === "drafts" ||
  post.data.draft === true ||
  /^draft:/i.test(post.id);

/** 날짜 내림차순, 같은 날짜면 id 오름차순. */
const byDateDesc = (a: Post, b: Post): number =>
  b.data.date.valueOf() - a.data.date.valueOf() || a.id.localeCompare(b.id);

/**
 * 발행된 글 전부. 초안은 빠진다. 날짜 내림차순(같은 날짜면 id 오름차순).
 * sitemap 이 이 함수로 글을 얻는다. 컬렉션을 직접 읽으면 초안이 섞인다.
 */
export async function getPublishedPosts(): Promise<CollectionEntry<"posts">[]> {
  const posts = await getCollection("posts", (post) => !isDraft(post));

  return posts.sort(byDateDesc);
}

/**
 * 글 페이지와 홈 목록이 그리는 글. 운영 빌드에서는 getPublishedPosts 와 같다.
 * astro dev 에서는 초안(최상위 초안과 posts/draft/)도 섞인다. isDraft 로 표시한다.
 *
 * import.meta.env.DEV 는 빌드할 때 false 로 정적 치환되어, dev 쪽 가지는 운영 빌드에서 돌지 않는다.
 */
export async function getVisiblePosts(): Promise<Post[]> {
  if (!import.meta.env.DEV) return getPublishedPosts();

  const posts = await getCollection("posts");
  const drafts = await getCollection("drafts");

  // posts/draft/a.md 와 posts/a.md 는 같은 주소(/posts/a)를 갖는다. 하나를 조용히 덮지 않고 멈춘다.
  const ids = new Set(posts.map((post) => post.id));
  const clash = drafts.filter((draft) => ids.has(draft.id));
  if (clash.length > 0)
    throw new Error(
      `posts/draft/ 의 초안이 최상위 글과 이름이 같다: ${clash.map((draft) => draft.id).join(", ")}`,
    );

  return [...posts, ...drafts].sort(byDateDesc);
}

/** dev 에서 초안의 제목 앞에 붙이는 표시. 운영 빌드에는 초안이 없어 붙을 일이 없다. <title> 에는 붙이지 않는다. */
export const displayTitle = (post: Post): string =>
  isDraft(post) ? `[초안] ${post.data.title}` : post.data.title;

/** YYYY-MM-DD. UTC 기준이라 빌드 환경의 시간대와 무관하다. */
export const formatDate = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const postPath = (id: string): string => `/posts/${id}`;

export const postUrl = (id: string): string => `${SITE.url}${postPath(id)}`;
