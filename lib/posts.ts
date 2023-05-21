import { readdirSync } from "fs";
import path from "path";

import matter from "gray-matter";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import {
  Infer,
  array,
  coerce,
  create,
  defaulted,
  object,
  optional,
  string,
} from "superstruct";
import { unified } from "unified";

import { __IS_DEV__ } from "../constant";

type MatterData = Infer<typeof MatterData>;

// eslint-disable-next-line no-redeclare
const MatterData = object({
  title: string(),
  date: string(),
  description: defaulted(string(), ""),
  keywords: coerce(
    array(string()),
    optional(string()),
    (value) => value?.split(",") ?? []
  ),
});

const postsDirectory = path.join(process.cwd(), "posts");

const sortByDateDesc = ({ date: a }: MatterData, { date: b }: MatterData) =>
  b.localeCompare(a);

const isDraft = (fileName: string) => /^draft:/i.test(fileName);

export const getSortedPostsData = () =>
  readdirSync(postsDirectory)
    .filter((fileName) => /\.md$/.test(fileName))
    .filter((fileName) => __IS_DEV__ || !isDraft(fileName))
    .map((fileName) => {
      const id = fileName.replace(/\.md$/, "");

      const fullPath = path.join(postsDirectory, fileName);
      const matterResult = matter.read(fullPath);
      const data = create(matterResult.data, MatterData);

      return { id, ...data };
    })
    .sort(sortByDateDesc);

export const getAllPostIds = () =>
  readdirSync(postsDirectory)
    .filter((fileName) => /\.md$/.test(fileName))
    .map((fileName) => {
      const id = fileName.replace(/\.md$/, "");

      return { params: { id } };
    });

export const getPostData = async (id: string) => {
  const fullPath = path.join(postsDirectory, `${id}.md`);
  const matterResult = matter.read(fullPath);
  const data = create(matterResult.data, MatterData);

  const processedContent = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(matterResult.content);

  const contentHtml = processedContent.toString();

  return {
    id,
    contentHtml,
    ...data,
  };
};
