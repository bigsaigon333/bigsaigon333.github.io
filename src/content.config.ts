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
  schema: z
    .object({
      title: z.string(),
      // "2022-05-08" → UTC 자정의 Date. 시간대 표기가 없는 날짜 문자열만 받아서 빌드 환경의 시간대를 타지 않는다.
      // 따옴표 없는 날짜는 받지 않는다. YAML 이 Date 로 바꾸면서 2022-02-30 같은 없는 날짜를 조용히 2022-03-02 로 넘기기 때문이다.
      date: z.iso
        .date({
          error: 'date 는 따옴표로 감싼 "YYYY-MM-DD" 형식의 실제 날짜여야 한다',
        })
        .transform((value) => new Date(value)),
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
    })
    // description 이 없으면 summary 를 쓴다(예전 글 일부는 summary 만 갖고 있다).
    .transform((data) => ({
      ...data,
      description: data.description ?? data.summary ?? "",
    })),
});

export const collections = { posts };
