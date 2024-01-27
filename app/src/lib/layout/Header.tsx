import { Box, Button, Flex, Heading } from '@chakra-ui/react';

import ThemeToggle from './ThemeToggle';
import { RiContrastDrop2Line } from 'react-icons/ri';
import Link from 'next/link';

const Header = () => {
  return (
    <Flex as="header" width="full" align="center">
      <Box display="inline-block" as={Link} href="/">
      <Heading  fontWeight={900}>
      <Box float="left" mr={1} transform="translateY(5px)">
        <RiContrastDrop2Line size="36" />
      </Box>FOIL</Heading>
      </Box>
      <Flex marginLeft="auto" gap={4}>
        <Button aria-label="view"  as={Link} href="/subscribe">Subscribe</Button>
        <Button aria-label="view"  as={Link} href="/earn">Earn</Button>
        <Button aria-label="view" as={Link} href="/pro">
         Pro Mode
        </Button>
        <ThemeToggle />
      </Flex>
    </Flex>
  );
};

export default Header;
