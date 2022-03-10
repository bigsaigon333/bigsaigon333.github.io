import { PropsWithChildren } from "react";

import {
  Body,
  EmailLink,
  Footer,
  GithubLink,
  Header,
  LinkList,
  Profile,
  Title,
} from "./layout.style";

interface LayoutProps {
  home?: boolean;
}

const Layout = ({ home, children }: PropsWithChildren<LayoutProps>) => {
  return (
    <>
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

          {home && (
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
          )}
        </Header>
        {children}
        <Footer>Copyright&copy; 2022 All right preserved</Footer>
      </Body>
    </>
  );
};

export default Layout;
