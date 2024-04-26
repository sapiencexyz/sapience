import { Box, Button, Flex, Heading } from '@chakra-ui/react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { RiContrastDrop2Line } from 'react-icons/ri';

import Foil from '../../../deployments/Foil.json';

const Header = () => {
  return (
    <Flex as="header" width="full" align="center" py={4}>
      <Box display="inline-block" as={Link} href="/">
        <Heading fontWeight={900} sx={{ fontFamily: 'var(--font-figtree)' }}>
          <Box float="left" mr={1} transform="translateY(5px)">
            <RiContrastDrop2Line size="36" />
          </Box>
          FOIL
        </Heading>
      </Box>
      <Flex marginLeft="auto" gap={6}>
        <Button
        borderRadius="md"
          aria-label="view"
          as={Link}
          href={`/8453:${Foil.address}`}
          bg="#0053ff"
          color="white"
        >
          Base Gas Market
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
