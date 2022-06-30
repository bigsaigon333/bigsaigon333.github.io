import { AppProps } from "next/app";
import Head from "next/head";
import Script from "next/script";

import GlobalStyle from "../styles/global-style";

const MyApp = ({ Component, pageProps }: AppProps) => {
  return (
    <>
      <Head>
        <meta name="viewport" content="initial-scale=1.0, width=device-width" />
      </Head>
      <Script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-Y270VJN1Y2"
      ></Script>
      <Script id="ga">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', 'G-Y270VJN1Y2');
        `}
      </Script>
      <GlobalStyle />
      <Component {...pageProps} />
    </>
  );
};

export default MyApp;
