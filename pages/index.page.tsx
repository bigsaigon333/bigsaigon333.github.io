import { InferGetStaticPropsType } from "next";
import Head from "next/head";
import Link from "next/link";

import { getSortedPostsData } from "../lib/posts";
import {
  Article,
  Body,
  EmailLink,
  Footer,
  GithubLink,
  Header,
  LinkList,
  Profile,
  Section,
  Title,
} from "./index.style";

export const getStaticProps = () => {
  const allPostsData = getSortedPostsData();

  return { props: { allPostsData } };
};

const Home = ({
  allPostsData,
}: InferGetStaticPropsType<typeof getStaticProps>) => {
  return (
    <>
      <Head>
        <title>김동희입니다</title>
        <meta name="description" content="김동희의 블로그" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Body>
        <Header>
          <Title>
            <Profile
              src="/profile.jpg"
              alt="김동희 프로필"
              width={160}
              height={160}
            />
            <span>
              프론트엔드 개발자
              <br />
              김동희입니다
            </span>
          </Title>

          <LinkList>
            <li>
              <EmailLink
                href="mailto:likepepperint@gmail.com"
                aria-label="김동희에게 메일 보내기"
                referrerPolicy="no-referrer"
                target="_blank"
              ></EmailLink>
            </li>
            <li>
              <GithubLink
                href="https://github.com/bigsaigon333"
                aria-label="김동희 깃허브"
                referrerPolicy="no-referrer"
                target="_blank"
              ></GithubLink>
            </li>
          </LinkList>
        </Header>
        <Section>
          {allPostsData.map(({ id, title, date, summary }) => (
            <Article key={id}>
              <Link href={`/posts/${id}`}>
                <a>
                  <h2>{title}</h2>
                </a>
              </Link>
              <time>{date}</time>
              <p>{summary}</p>
            </Article>
          ))}
        </Section>

        <Footer>Copyright&copy; 2022 All right preserved</Footer>
      </Body>
    </>
  );
};

export default Home;
