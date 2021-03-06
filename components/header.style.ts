import styled from "styled-components";

export const Container = styled.header`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
`;

export const Title = styled.h1`
  margin: 0;
  line-height: 1.25;
  width: 100%;
  font-weight: 800;
`;

export const A = styled.a`
  width: 100%;
  font-size: 3.6rem;
  text-align: center;
  display: flex;
  column-gap: 2rem;
  justify-content: center;
  align-items: center;

  &:hover p span {
    box-shadow: 0 0.25rem 0 0 black;
  }

  @media (max-width: 767px) {
    font-size: 9vw;
    column-gap: 1rem;
  }
`;

export const ProfileWrapper = styled.div`
  position: relative;
  overflow: hidden;
  border-radius: 35%;
  width: 25%;
  padding-bottom: 25%;

  @media (max-width: 600px) {
    width: 20%;
    padding-bottom: 20%;
  }
`;

export const Profile = styled.img`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
