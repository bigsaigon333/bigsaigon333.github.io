import { getCollection, getEntries, type CollectionEntry } from "astro:content";

import { isDraft } from "./posts";

type PostEntry = CollectionEntry<"posts">;

/** 시리즈 안에서 글 하나의 자리. index 는 0 부터. */
export interface SeriesPosition {
  name: string;
  index: number;
  total: number;
  prev?: PostEntry;
  next?: PostEntry;
}

interface ResolvedSeries {
  name: string;
  posts: PostEntry[];
}

/**
 * series 컬렉션을 읽고 참조를 글로 바꾼다. reference() 는 스키마 검사 때 대상이 있는지 보지 않고,
 * getEntries() 는 없는 글 자리에 undefined 를 넣는다. 그래서 여기서 확인해 빌드를 멈춘다.
 * 한 글이 두 시리즈에 들어 있어도 멈춘다(이전/다음이 둘이 된다).
 *
 * 운영 빌드에서는 초안을 순서에서 뺀다. 초안에는 페이지가 없어 링크가 깨진다.
 */
async function load(): Promise<ResolvedSeries[]> {
  const all = await getCollection("series");
  const owner = new Map<string, string>();
  const resolved: ResolvedSeries[] = [];

  for (const series of all) {
    const entries = await getEntries(series.data.posts);
    const missing = series.data.posts
      .filter((_, index) => entries[index] === undefined)
      .map((ref) => ref.id);
    if (missing.length > 0)
      throw new Error(
        `시리즈 "${series.id}"(src/content/series.json)가 없는 글을 가리킨다: ${missing.join(", ")}`,
      );

    for (const post of entries) {
      const other = owner.get(post.id);
      if (other !== undefined)
        throw new Error(
          `글 "${post.id}"가 시리즈 "${other}"와 "${series.id}"에 함께 들어 있다`,
        );
      owner.set(post.id, series.id);
    }

    resolved.push({
      name: series.data.name,
      posts: entries.filter((post) => import.meta.env.DEV || !isDraft(post)),
    });
  }

  return resolved;
}

let cache: Promise<ResolvedSeries[]> | undefined;

/** 글이 속한 시리즈와 그 안의 자리. 시리즈에 없으면 undefined. */
export async function getSeriesPosition(
  postId: string,
): Promise<SeriesPosition | undefined> {
  // dev 에서는 매번 읽는다. series.json 을 고치면 다음 요청에 바로 보인다.
  const all = import.meta.env.DEV ? await load() : await (cache ??= load());
  for (const { name, posts } of all) {
    const index = posts.findIndex((post) => post.id === postId);
    if (index === -1) continue;
    return {
      name,
      index,
      total: posts.length,
      prev: posts[index - 1],
      next: posts[index + 1],
    };
  }
  return undefined;
}
