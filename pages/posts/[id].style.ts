import styled from "styled-components";

export const Main = styled.main`
  flex-grow: 1;
  line-height: 1.75;

  a {
    word-break: break-word;
  }

  a:hover {
    box-shadow: 0 0.125rem 0 0 black;
  }

  ul {
    margin: 0;
    padding-inline-start: 20px;
  }
`;
