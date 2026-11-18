/**
 * 카테고리 = 글 frontmatter 의 `category`. 글마다 정확히 하나다(src/content.config.ts 가 이 목록의 name 만 받는다).
 *
 * 카테고리를 더하려면 아래 CATEGORIES 에 한 줄을 더한다. 스키마, /categories 목록, /categories/<slug> 페이지,
 * sitemap 이 모두 이 목록을 읽는다. 검증 장치(scripts/verify/checks/categories.mjs)도 이 파일의 줄을 읽으므로
 * 항목은 한 줄에 하나, `{ id: "…", name: "…", slug: "…", description: "…" },` 모양으로 둔다.
 *
 * - id: 코드에서 부르는 이름. 바꾸지 않는다.
 * - name: frontmatter 에 적고 화면에 보이는 한국어 이름.
 * - slug: 주소(/categories/<slug>)에 쓰는 ASCII. 한 번 정하면 바꾸지 않는다(밖에서 걸린 링크가 깨진다).
 * - description: 카테고리 페이지의 소개 한 줄이자 meta description.
 *
 * 이 모듈은 다른 모듈을 가져오지 않는다. content.config.ts 가 가져오므로 astro:content 를 부르면 순환한다.
 */
// prettier-ignore
export const CATEGORIES = [
  { id: "dev", name: "개발", slug: "dev", description: "프론트엔드와 프로그래밍을 공부하며 정리한 글" },
  { id: "real-estate", name: "부동산", slug: "real-estate", description: "집과 부동산을 알아보며 정리한 글" },
  { id: "life", name: "일상", slug: "life", description: "그 밖의 생각과 하루의 기록" },
] as const;

export type Category = (typeof CATEGORIES)[number];
export type CategoryName = Category["name"];

/** z.enum 에 넘기는 이름 목록(비지 않은 튜플). */
export const CATEGORY_NAMES = CATEGORIES.map((category) => category.name) as [
  CategoryName,
  ...CategoryName[],
];

export const CATEGORIES_PATH = "/categories";

/** 이름("개발")으로 찾는다. 없는 이름이면 멈춘다: 스키마가 막으므로 여기에 오면 목록과 스키마가 어긋난 것이다. */
export function categoryByName(name: string): Category {
  const category = CATEGORIES.find((item) => item.name === name);
  if (category === undefined)
    throw new Error(
      `카테고리 "${name}" 가 src/lib/categories.ts 에 없다: ${CATEGORY_NAMES.join(", ")} 중 하나를 쓴다`,
    );
  return category;
}

/** 사이트 안 주소("/categories/dev"). slug 가 ASCII 라 인코딩하지 않는다. */
export const categoryPath = (category: Category): string =>
  `${CATEGORIES_PATH}/${category.slug}`;

/**
 * 카테고리마다 그 카테고리의 글. CATEGORIES 의 순서대로, 글이 없는 카테고리도 빈 목록으로 싣는다
 * (카테고리 페이지의 주소가 글 수와 상관없이 늘 있다). 글의 순서는 받은 순서 그대로다(getVisiblePosts 의 최신순).
 */
export function groupByCategory<P extends { data: { category: string } }>(
  posts: readonly P[],
): { category: Category; posts: P[] }[] {
  const groups = CATEGORIES.map((category) => ({
    category: category as Category,
    posts: [] as P[],
  }));
  for (const post of posts) {
    const category = categoryByName(post.data.category);
    groups.find((group) => group.category.id === category.id)?.posts.push(post);
  }
  return groups;
}
