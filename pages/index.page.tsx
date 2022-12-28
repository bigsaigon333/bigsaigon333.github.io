import { InferGetStaticPropsType } from "next";
import Head from "next/head";
import Link from "next/link";

import Layout from "../components/layout";
import { getSortedPostsData } from "../lib/posts";
import { Article, Section } from "./index.style";

export const getStaticProps = () => {
  const allPostsData = getSortedPostsData();

  return { props: { allPostsData } };
};

const Home = ({
  allPostsData,
}: InferGetStaticPropsType<typeof getStaticProps>) => {
  return (
    <Layout home>
      <Head>
        <title>김동희입니다</title>
        <meta name="description" content="김동희의 블로그" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Section>
        {allPostsData.map(({ id, title, date }) => (
          <Article key={id}>
            <Link href={`/posts/${id}`} passHref>
              <h2>{title}</h2>
            </Link>
            <time>{date}</time>
          </Article>
        ))}
      </Section>
    </Layout>
  );
};

export default Home;
