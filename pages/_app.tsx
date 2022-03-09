import { AppProps } from "next/app";

import GlobalStyle from "../styles/global-style";

const MyApp = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <GlobalStyle />
      <Component {...pageProps} />;
    </>
  );
};

export default MyApp;
