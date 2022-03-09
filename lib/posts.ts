import { readFileSync, readdirSync } from "fs";
import path from "path";

import matter from "gray-matter";
import { remark } from "remark";
import remarkHtml from "remark-html";

const postsDirectory = path.join(process.cwd(), "posts");

export const getAllPostIds = () =>
  readdirSync(postsDirectory).map((fileName) => {
    const id = fileName.replace(/\.md$/, "");

    return { params: { id } };
  });

export const getPostData = async (id: string) => {
  const fullPath = path.join(postsDirectory, `${id}.md`);
  const fileContents = readFileSync(fullPath, "utf8");

  const matterResult = matter(fileContents);
  const data = matterResult.data as { title: string; date: string };

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
