import { Box, Button, Flex, Heading } from '@chakra-ui/react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { RiContrastDrop2Line } from 'react-icons/ri';

const Header = () => {
  return (
    <Flex as="header" width="full" align="center" py={4}>
      <Box display="inline-block" as={Link} href="/">
        <Heading fontWeight={900}>
          <Box float="left" mr={1} transform="translateY(5px)">
            <RiContrastDrop2Line size="36" />
          </Box>
          FOIL
        </Heading>
      </Box>
      <Flex marginLeft="auto" gap={4}>
        <Button aria-label="view" as={Link} href="/trade/Gas">
          Trade
        </Button>
        <Button aria-label="view" as={Link} href="/lp/Gas">
          LP
        </Button>
        {/*
        <Button aria-label="view" as={Link} href="/subscribe">
          Subscribe
        </Button>
        <Button aria-label="view" as={Link} href="/earn">
          Earn
        </Button>
        <Button aria-label="view" as={Link} href="/pro">
          Pro Mode
        </Button>
        */}
        <ConnectButton />
      </Flex>
    </Flex>
  );
};

export default Header;
