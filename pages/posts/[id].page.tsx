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
  const { id, title, date, description, contentHtml, keywords } = postData;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current === null) {
      return;
    }

    ref.current.replaceWith(createUtterancScript());
  }, []);

  const url = `https://bigsaigon333.github.io/posts/${id}`;

  return (
    <Layout>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="author" content="김동희" />
        <meta name="keywords" content={keywords.join(", ")} />
        <link rel="canonical" href={url} />

        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="article" />
        <meta
          property="og:image"
          content="https://bigsaigon333.github.io/main-og-image.jpg"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta
          name="twitter:image"
          content="https://bigsaigon333.github.io/main-og-image.jpg"
        />
      </Head>
      <Article>
        <h2>{title}</h2>
        <time>{date}</time>
      </Article>
      <Main dangerouslySetInnerHTML={{ __html: contentHtml }} />
      <div ref={ref} />
    </Layout>
  );
};

export default Post;
