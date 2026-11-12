import { getCollection, type CollectionEntry } from "astro:content";

import { SITE } from "./site";

/** 발행된 글 전부. 날짜 내림차순(같은 날짜면 id 오름차순). */
export async function getPublishedPosts(): Promise<CollectionEntry<"posts">[]> {
  const posts = await getCollection("posts");

  return posts.sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf() || a.id.localeCompare(b.id),
  );
}

/** YYYY-MM-DD. UTC 기준이라 빌드 환경의 시간대와 무관하다. */
export const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

export const postPath = (id: string): string => `/posts/${id}`;

export const postUrl = (id: string): string => `${SITE.url}${postPath(id)}`;
