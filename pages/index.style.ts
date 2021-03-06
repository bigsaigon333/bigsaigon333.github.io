import styled from "styled-components";

export const Section = styled.section`
  width: 100%;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  row-gap: 2rem;

  a:hover {
    text-decoration: underline;
  }
`;

export const Article = styled.article`
  h2 {
    font-size: 2.5rem;
    margin: 0 0 0.5rem;
    font-weight: 800;

    @media (max-width: 600px) {
      font-size: 2rem;
    }

    @media (max-width: 375px) {
      font-size: 1.5rem;
    }
  }

  time {
    font-size: 1rem;
  }

  p {
    font-size: 1.25rem;
    line-height: 1.75rem;
  }
`;
