import { InferGetStaticPropsType } from "next";

import Layout from "../../components/layout";
import { getAllPostIds, getPostData } from "../../lib/posts";
import { Main } from "./[id].style";

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
    <Layout>
      <div>
        <h1>{title}</h1>
        <time>{date}</time>
      </div>
      <Main dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </Layout>
  );
};

export default Post;
