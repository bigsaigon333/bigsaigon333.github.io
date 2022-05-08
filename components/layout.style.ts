import styled from "styled-components";

export const Body = styled.div`
  min-height: 100vh;
  padding: 3rem 2rem 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  row-gap: 2rem;
  max-width: 768px;
  margin: auto;

  @media (max-width: 600px) {
    padding: 2rem 1rem 0;
  }
`;

export const Footer = styled.footer`
  display: flex;
  width: calc(100vw - 3rem);
  padding: 2rem 0 1rem;
  border-top: 1px solid #eaeaea;
  justify-content: center;
  align-items: center;
`;
