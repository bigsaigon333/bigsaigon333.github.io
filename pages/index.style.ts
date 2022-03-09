import Image from "next/image";
import styled from "styled-components";

export const Container = styled.div`
  padding: 0 2rem;
`;

export const Main = styled.main`
  min-height: 100vh;
  padding: 4rem 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
`;

export const Profile = styled(Image)`
  border-radius: 35%;
`;

export const Title = styled.h1`
  margin: 0;
  line-height: 1.25;
  font-size: 3.5rem;
  text-align: center;
  display: flex;
  column-gap: 1rem;
  align-items: center;
`;

export const LinkList = styled.ul`
  margin: 2rem 0;
  line-height: 1.5;
  font-size: 1.5rem;
  list-style: none;
  display: flex;
  column-gap: 1rem;
  align-items: center;

  li a {
    display: block;

    &:hover {
      opacity: 0.4;
    }
  }
`;

export const EmailLink = styled.a`
  background-image: url("/email.png");
  background-size: cover;
  width: 40px;
  height: 40px;
`;

export const GithubLink = styled.a`
  background-image: url("/github-sign.png");
  background-size: cover;
  width: 35px;
  height: 35px;
`;

export const Footer = styled.footer`
  display: flex;
  flex: 1;
  padding: 2rem 0;
  border-top: 1px solid #eaeaea;
  justify-content: center;
  align-items: center;
`;

export const Grid = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  max-width: 800px;

  @media (max-width: 600px) {
    width: 100%;
    flex-direction: column;
  }
`;
