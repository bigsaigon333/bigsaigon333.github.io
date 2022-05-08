import { PropsWithChildren } from "react";

import Header from "./header";
import { Body, Footer } from "./layout.style";

interface LayoutProps {
  home?: boolean;
}

const Layout = ({ home, children }: PropsWithChildren<LayoutProps>) => {
  return (
    <>
      <Body>
        <Header home={home} />
        {children}
        <Footer>Copyright&copy; 2022 All right reserved</Footer>
      </Body>
    </>
  );
};

export default Layout;
