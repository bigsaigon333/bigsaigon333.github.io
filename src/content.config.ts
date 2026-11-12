import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
  loader: glob({
    // 최상위 *.md 만 읽는다. posts/draft/ 는 걸리지 않는다.
    pattern: "*.md",
    base: "./posts",
    // id = 파일 이름에서 .md 를 뗀 것. 기본 구현(github-slugger)은 대소문자와 기호를 바꾼다.
    generateId: ({ entry }) => entry.replace(/\.md$/, ""),
  }),
  schema: z.object({
    title: z.string(),
    // "2022-05-08" → UTC 자정의 Date. 시간대 표기가 없는 날짜 문자열만 받아서 빌드 환경의 시간대를 타지 않는다.
    date: z.iso.date().transform((value) => new Date(value)),
    description: z.string().default(""),
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
  }),
});

export const collections = { posts };
