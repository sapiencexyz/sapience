'use client';

import { Box, Container, Flex } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import Footer from './Footer';
import Header from './Header';

type LayoutProps = {
  children: ReactNode;
};

const Layout = ({ children }: LayoutProps) => {
  return (
    <Flex
      direction="column"
      minHeight="100dvh"
      margin="0 auto"
      maxWidth={800}
      transition="0.5s ease-out"
    >
      <Header />
      <Container flex="1" as="main">{children}</Container>
      <Footer />
    </Flex>
  );
};

export default Layout;
