import styled from "styled-components";

export const Body = styled.div`
  min-height: 100vh;
  padding: 4rem 2rem 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  /* background-color: #faebef; */
  color: #333d79;
  max-width: 768px;
  margin: auto;
`;

export const Header = styled.header`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const Profile = styled.img`
  border-radius: 35%;
  object-fit: cover;
  aspect-ratio: 1 / 1;
`;

export const Title = styled.h1`
  margin: 0;
  line-height: 1.25;
  font-size: 3.5rem;
  text-align: center;
  display: flex;
  column-gap: 1rem;
  align-items: center;
  font-weight: 800;
`;

export const LinkList = styled.ul`
  margin: 1rem 0;
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
  width: calc(100vw - 3rem);
  padding: 2rem 0 1rem;
  border-top: 1px solid #eaeaea;
  justify-content: center;
  align-items: center;
`;