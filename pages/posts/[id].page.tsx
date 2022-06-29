import { InferGetStaticPropsType } from "next";
import Head from "next/head";

import "highlight.js/styles/base16/monokai.css";
import { useEffect, useRef } from "react";

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

const createUtterancScript = () => {
  const script = document.createElement("script");
  script.src = "https://utteranc.es/client.js";
  script.setAttribute("repo", "bigsaigon333/bigsaigon333.github.io");
  script.setAttribute("issue-term", "title");
  script.setAttribute("theme", "boxy-light");
  script.crossOrigin = "anonymous";
  script.async = true;

  return script;
};

export const getStaticProps = async ({ params }: Params) => {
  const postData = await getPostData(params.id);

  return { props: { postData } };
};

const Post = ({ postData }: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { title, date, contentHtml } = postData;
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (mainRef.current === null) {
      return;
    }

    mainRef.current.insertAdjacentElement("afterend", createUtterancScript());
  }, []);

  return (
    <Layout>
      <Head>
        <title>{title}</title>
      </Head>
      <Article>
        <h2>{title}</h2>
        <time>{date}</time>
      </Article>
      <Main ref={mainRef} dangerouslySetInnerHTML={{ __html: contentHtml }} />
    </Layout>
  );
};

export default Post;
