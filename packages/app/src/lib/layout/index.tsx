'use client';

import { Flex } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import Footer from './Footer';
import Header from './Header';

type LayoutProps = {
  children: ReactNode;
};

const Layout = ({ children }: LayoutProps) => {
  return (
    <Flex direction="column" minHeight="100dvh" transition="0.5s ease-out">
      <Header />
      <Flex flex="1" as="main" width="100%">
        {children}
      </Flex>
      <Footer />
    </Flex>
  );
};

export default Layout;
