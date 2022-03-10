import styled from "styled-components";

export const Section = styled.section`
  width: 100%;
  flex-grow: 1;

  a:hover {
    text-decoration: underline;
  }
`;

export const Article = styled.article`
  margin: 2rem 0;

  h2 {
    font-size: 2.5rem;
    margin-bottom: 1rem;
    font-weight: 800;

    @media (max-width: 600px) {
      font-size: 2rem;
      margin-bottom: 0.75rem;
    }

    @media (max-width: 375px) {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
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
