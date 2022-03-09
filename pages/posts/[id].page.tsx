import { InferGetStaticPropsType } from "next";

import { getAllPostIds, getPostData } from "../../lib/posts";

export const getStaticPaths = async () => {
  return {
    paths: getAllPostIds(),
    fallback: false,
  };
};

type Params = {
  params: { id: string };
};

export const getStaticProps = async ({ params }: Params) => {
  const postData = await getPostData(params.id);

  return { props: { postData } };
};

const Post = ({ postData }: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { title, date, contentHtml } = postData;

  return (
    <div>
      <header>
        <h1>{title}</h1>
        <time>{date}</time>
      </header>
      <main dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </div>
  );
};

export default Post;
