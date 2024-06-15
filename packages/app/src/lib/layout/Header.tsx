import { ChevronDownIcon } from '@chakra-ui/icons';
import { Box, Flex, Image } from '@chakra-ui/react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';

import Foil from '../../../deployments/Foil.json';

const Header = () => {
  return (
    <Box
      as="header"
      width="full"
      p={3}
      zIndex={3}
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.100"
    >
      <Flex margin="0 auto" maxWidth="container.lg" align="center">
        <Box display="inline-block" as={Link} href="/">
          <Image src="/logo.svg" alt="Foil" height="28px" />
        </Box>
        <Flex marginLeft="auto" gap={6} align="center">
          <Link href={`markets/31337:${Foil.address}`}>
            Markets <ChevronDownIcon />
          </Link>
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
    </Box>
  );
};

export default Header;
