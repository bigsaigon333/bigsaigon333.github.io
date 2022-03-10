import styled from "styled-components";

export const Container = styled.header`
  display: flex;
  flex-direction: column;
  align-items: center;
`;

export const Title = styled.h1`
  margin: 0;
  line-height: 1.25;
  font-size: 3.5rem;
  text-align: center;
  display: flex;
  column-gap: 2rem;
  justify-content: center;
  align-items: center;
  font-weight: 800;

  @media (max-width: 767px) {
    font-size: 3.25rem;
    column-gap: 1rem;
  }

  @media (max-width: 600px) {
    font-size: 2.5rem;
  }

  @media (max-width: 375px) {
    font-size: 2rem;
  }
  @media (max-width: 320px) {
    font-size: 1.75rem;
  }
`;

export const Profile = styled.img`
  width: 25%;
  border-radius: 35%;
  object-fit: cover;
  aspect-ratio: 1 / 1;

  @media (max-width: 600px) {
    width: 20%;
  }
`;

export const LinkList = styled.ul`
  margin: 1rem 0;
  list-style: none;
  display: flex;
  column-gap: 1rem;
  align-items: center;
  padding: 0;

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

  @media (max-width: 375px) {
    width: 25px;
    height: 25px;
  }
`;

export const GithubLink = styled.a`
  background-image: url("/github-sign.png");
  background-size: cover;
  width: 35px;
  height: 35px;

  @media (max-width: 375px) {
    width: 20px;
    height: 20px;
  }
`;
