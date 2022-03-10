import { readFileSync, readdirSync } from "fs";
import path from "path";

import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

type MatterData = { title: string; date: string; summary: string };

const postsDirectory = path.join(process.cwd(), "posts");

const sortByDateDesc = ({ date: a }: MatterData, { date: b }: MatterData) =>
  b.localeCompare(a);

const isDraft = (fileName: string) => /^draft:/i.test(fileName);

export const getSortedPostsData = () => {
  const fileNames = readdirSync(postsDirectory);

  const allPostsData = fileNames
    .filter((fileName) => !isDraft(fileName))
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

  const processedContent = await remark()
    .use(remarkHtml)
    .process(matterResult.content);
  const contentHtml = processedContent.toString();

  return {
    id,
    contentHtml,
    ...data,
  };
};
