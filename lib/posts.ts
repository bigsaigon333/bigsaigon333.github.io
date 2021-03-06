import { readFileSync, readdirSync } from "fs";
import path from "path";

import matter from "gray-matter";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

import { __IS_DEV__ } from "../constant";

type MatterData = { title: string; date: string };

const postsDirectory = path.join(process.cwd(), "posts");

const sortByDateDesc = ({ date: a }: MatterData, { date: b }: MatterData) =>
  b.localeCompare(a);

const isDraft = (fileName: string) => /^draft:/i.test(fileName);

export const getSortedPostsData = () => {
  const fileNames = readdirSync(postsDirectory);

  const allPostsData = fileNames
    .filter((fileName) => __IS_DEV__ || !isDraft(fileName))
    .map((fileName) => {
      const id = fileName.replace(/\.md$/, "");

      const fullPath = path.join(postsDirectory, fileName);
      const fileContents = readFileSync(fullPath, "utf8");

      const matterResult = matter(fileContents);
      const data = matterResult.data as MatterData;

      return { id, ...data };
    });

  return allPostsData.sort(sortByDateDesc);
};

export const getAllPostIds = () =>
  readdirSync(postsDirectory).map((fileName) => {
    const id = fileName.replace(/\.md$/, "");

    return { params: { id } };
  });

export const getPostData = async (id: string) => {
  const fullPath = path.join(postsDirectory, `${id}.md`);
  const fileContents = readFileSync(fullPath, "utf8");

  const matterResult = matter(fileContents);
  const data = matterResult.data as MatterData;

  const processedContent = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
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
