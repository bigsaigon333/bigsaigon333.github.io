import { InferGetStaticPropsType } from "next";
import Head from "next/head";
import Link from "next/link";

import { format } from "date-fns";

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
        <title>김동희의 개발블로그</title>
        <meta
          name="description"
          content="프론트엔드 개발과 관련된 이야기를 다룹니다."
        />
        <meta name="author" content="김동희" />
        <meta
          name="keywords"
          content="김동희,프론트엔드,개발,자바스크립트,타입스크립트,JS,javascript,typescript,TS,react"
        />
        <link rel="canonical" href="https://bigsaigon333.github.io" />

        <meta property="og:title" content="김동희의 개발블로그" />
        <meta
          property="og:description"
          content="프론트엔드 개발과 관련된 이야기를 다룹니다."
        />
        <meta property="og:url" content="https://bigsaigon333.github.io" />
        <meta property="og:type" content="website" />
        <meta
          property="og:image"
          content="https://bigsaigon333.github.io/main-og-image.jpg"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="김동희의 개발블로그" />
        <meta
          name="twitter:description"
          content="프론트엔드 개발과 관련된 이야기를 다룹니다."
        />
        <meta
          name="twitter:image"
          content="https://bigsaigon333.github.io/main-og-image.jpg"
        />
      </Head>

      <Section>
        {allPostsData.map(({ id, title, date }) => (
          <Article key={id}>
            <Link href={`/posts/${id}`}>
              <h2>{title}</h2>
            </Link>
            <time dateTime={date.toISOString()}>
              {format(date, "yyyy-MM-dd")}
            </time>
          </Article>
        ))}
      </Section>
    </Layout>
  );
};

export default Home;
