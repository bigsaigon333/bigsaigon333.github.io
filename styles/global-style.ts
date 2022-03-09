import { createGlobalStyle } from "styled-components";

const GlobalStyle = createGlobalStyle`

/* css-remedy */
  *,
  ::before,
  ::after {
    box-sizing: border-box;
  }

  html {
    line-sizing: normal;
  }

  body {
    margin: 0;
  }

  [hidden] {
    display: none;
  }

  h1 {
    font-size: 2rem;
  }
  h2 {
    font-size: 1.5rem;
  }
  h3 {
    font-size: 1.17rem;
  }
  h4 {
    font-size: 1rem;
  }
  h5 {
    font-size: 0.83rem;
  }
  h6 {
    font-size: 0.67rem;
  }

  h1 {
    margin: 0.67em 0;
  }

  pre {
    white-space: pre-wrap;
  }

  hr {
    border-style: solid;
    border-width: 1px 0 0;
    color: inherit;
    height: 0;
    overflow: visible;
  }

  img,
  svg,
  video,
  canvas,
  audio,
  iframe,
  embed,
  object {
    display: block;
    vertical-align: middle;
    max-width: 100%;
  }
  audio:not([controls]) {
    display: none;
  }

  picture {
    display: contents;
  }
  source {
    display: none;
  }

  img,
  svg,
  video,
  canvas {
    height: auto;
  }

  audio {
    width: 100%;
  }

  img {
    border-style: none;
  }

  svg {
    overflow: hidden;
  }

  article,
  aside,
  details,
  figcaption,
  figure,
  footer,
  header,
  hgroup,
  main,
  nav,
  section {
    display: block;
  }

  [type="checkbox"],
  [type="radio"] {
    box-sizing: border-box;
    padding: 0;
  }


  /* custom global style */
  html,
body {
  padding: 0;
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen,
    Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue, sans-serif;
}

a {
  color: inherit;
  text-decoration: none;
}

`;

export default GlobalStyle;
