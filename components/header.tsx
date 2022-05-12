import Link from "next/link";

import {
  A,
  Container,
  EmailLink,
  GithubLink,
  LinkList,
  Profile,
  ProfileWrapper,
  Title,
} from "./header.style";

interface HeaderProps {
  home?: boolean;
}

const Header = ({ home }: HeaderProps) => {
  return (
    <Container>
      <Title>
        <Link href="/" passHref={true}>
          <A>
            <ProfileWrapper>
              <Profile src="/profile.jpg" alt="프로필" />
            </ProfileWrapper>
            <span>
              프론트엔드 개발자
              <br />
              김동희입니다
            </span>
          </A>
        </Link>
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
    </Container>
  );
};

export default Header;
