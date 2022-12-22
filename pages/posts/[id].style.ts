import styled from "styled-components";

export const Main = styled.main`
  width: 100%;
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

  & :not(pre) > code {
    border-radius: 0.3em;
    background: rgb(255 229 100 / 20%);
    color: #1a1a1a;
    padding: 0.15em 0.2em 0.05em;
    white-space: normal;
  }

  details > summary {
    cursor: pointer;
  }

  blockquote {
    margin: 0 1.75rem 1.75rem 0.5rem;
    padding: 0 0 0 1rem;
    line-height: 1.75rem;
    color: inherit;
    font-style: italic;
    border-left: 0.3281rem solid hsl(0deg 0% 0% / 90%);
    border-left-color: inherit;
    opacity: 0.8;
  }

  table {
    display: block;
    width: 100%;
    width: max-content;
    max-width: 100%;
    overflow: auto;
    margin-top: 0;
    margin-bottom: 1rem;
    border-spacing: 0;
    border-collapse: collapse;

    tr {
      border-top: 1px solid hsl(210deg 18% 87% / 100%);

      &:nth-child(2n) {
        background-color: #f6f8fa;
      }
    }

    th {
      font-weight: 600;
    }

    th,
    td {
      padding: 6px 13px;
      border: 1px solid #d0d7de;
    }
  }
`;
