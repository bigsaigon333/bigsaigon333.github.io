import { NextPage } from "next";
import Head from "next/head";

import {
  Container,
  EmailLink,
  Footer,
  GithubLink,
  LinkList,
  Main,
  Profile,
  Title,
} from "./index.style";

const Home: NextPage = () => {
  return (
    <Container>
      <Head>
        <title>김동희입니다</title>
        <meta name="description" content="김동희의 블로그" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <Main>
        <Title>
          <Profile
            src="/profile.jpg"
            alt="김동희 프로필"
            width={160}
            height={160}
            objectFit="cover"
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
              target={"_blank"}
            ></EmailLink>
          </li>
          <li>
            <GithubLink
              href="https://github.com/bigsaigon333"
              aria-label="김동희 깃허브"
              referrerPolicy="no-referrer"
              target={"_blank"}
            ></GithubLink>
          </li>
        </LinkList>
      </Main>

      <Footer>Copyright&copy; 2022 All right preserved</Footer>
    </Container>
  );
};

export default Home;
