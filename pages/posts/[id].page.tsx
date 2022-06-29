import { InferGetStaticPropsType } from "next";
import Head from "next/head";

import "highlight.js/styles/base16/monokai.css";

import Layout from "../../components/layout";
import { getAllPostIds, getPostData } from "../../lib/posts";
import { Article } from "../index.style";
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
      <Head>
        <title>{title}</title>
      </Head>
      <Article>
        <h2>{title}</h2>
        <time>{date}</time>
      </Article>
      <Main dangerouslySetInnerHTML={{ __html: contentHtml }} />
      <script
        src="https://utteranc.es/client.js"
        /* @ts-ignore */
        repo="bigsaigon333/bigsaigon333.github.io"
        issue-term="title"
        theme="boxy-light"
        crossOrigin="anonymous"
        async
      ></script>
    </Layout>
  );
};

export default Post;
