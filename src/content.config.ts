import { defineCollection, reference } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";

// id = 파일 이름에서 .md(또는 .mdx) 를 뗀 것. 기본 구현(github-slugger)은 대소문자와 기호를 바꾼다.
const generateId = ({ entry }: { entry: string }): string =>
  entry.replace(/\.mdx?$/, "");

// "2022-05-08" → UTC 자정의 Date. 시간대 표기가 없는 날짜 문자열만 받아서 빌드 환경의 시간대를 타지 않는다.
// 따옴표 없는 날짜는 받지 않는다. YAML 이 Date 로 바꾸면서 2022-02-30 같은 없는 날짜를 조용히 2022-03-02 로 넘기기 때문이다.
const date = z.iso
  .date({
    error: 'date 는 따옴표로 감싼 "YYYY-MM-DD" 형식의 실제 날짜여야 한다',
  })
  .transform((value) => new Date(value));

const fields = {
  title: z.string(),
  date,
  description: z.string().optional(),
  // "a, b" → ["a", "b"]
  keywords: z
    .string()
    .optional()
    .transform(
      (value) =>
        value
          ?.split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean) ?? [],
    ),
  summary: z.string().optional(),
  // true 면 초안이다. 운영 빌드에 나가지 않는다(lib/posts.ts 의 isDraft).
  draft: z.boolean().optional(),
};

const posts = defineCollection({
  loader: glob({
    // 최상위 *.md 만 읽는다. posts/draft/ 는 아래 drafts 컬렉션이 읽는다.
    // 최상위에 놓인 초안(draft: true, 또는 이름이 "draft:" 로 시작)도 읽히고, lib/posts.ts 가 운영 빌드에서 걸러낸다.
    pattern: "*.{md,mdx}",
    base: "./posts",
    generateId,
  }),
  schema: z
    // 아는 키만 받는다. "desciption" 처럼 잘못 쓴 키가 조용히 버려지지 않고 빌드가 멈춘다.
    .strictObject(fields)
    // description 이 없으면 summary 를 쓴다(예전 글 일부는 summary 만 갖고 있다).
    .transform((data) => ({
      ...data,
      description: data.description ?? data.summary ?? "",
    })),
});

/**
 * posts/draft/ 의 초안. astro dev 에서만 읽는다. 운영 빌드에서는 빈 컬렉션이라
 * 쓰다 만 초안의 frontmatter 가 배포를 멈추지 않고, 초안 원고가 운영 빌드의 콘텐츠 저장소에도 들어가지 않는다.
 *
 * 쓰다 만 글이라 title 과 date 가 없어도 된다(frontmatter 가 아예 없는 초안도 있다). 그 밖의 키는 posts 와 같다.
 * 결과의 모양은 posts 와 같다: title 이 없으면 "(제목 없음)", date 가 없으면 1970-01-01.
 */
const drafts = defineCollection({
  // import.meta.env.DEV: astro dev 에서 true, astro build 에서 false.
  loader: import.meta.env.DEV
    ? glob({ pattern: "*.{md,mdx}", base: "./posts/draft", generateId })
    : () => [],
  schema: z
    .strictObject({
      ...fields,
      title: fields.title.optional(),
      date: fields.date.optional(),
    })
    .transform((data) => ({
      ...data,
      title: data.title ?? "(제목 없음)",
      date: data.date ?? new Date(0),
      description: data.description ?? data.summary ?? "",
    })),
});

/**
 * 연재 글 묶음. src/content/series.json 의 배열 항목 하나가 시리즈 하나다(file() 로더는 id 를 만들지 않아 항목마다 id 가 있다).
 * posts 는 읽는 순서대로 적은 글 id 이고, reference("posts") 가 { collection: "posts", id } 로 바꾼다.
 * reference() 는 대상 글이 있는지 보지 않는다. 없는 글을 적으면 lib/series.ts 가 빌드를 멈춘다.
 */
const series = defineCollection({
  loader: file("src/content/series.json"),
  schema: z.strictObject({
    id: z.string(),
    name: z.string(),
    posts: z.array(reference("posts")).min(2),
  }),
});

export const collections = { posts, drafts, series };
