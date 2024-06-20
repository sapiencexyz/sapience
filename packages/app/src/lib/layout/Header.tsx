import { ChevronDownIcon } from '@chakra-ui/icons';
import { Box, Flex, Image } from '@chakra-ui/react';
import Link from 'next/link';

import Foil from '../../../deployments/Foil.json';
import ConnectButton from '../components/ConnectButton';

const Header = () => {
  return (
    <Box
      as="header"
      width="full"
      py={3}
      zIndex={3}
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.300"
    >
      <Flex margin="0 auto" maxWidth="container.lg" align="center" px={3}>
        <Box display="inline-block" as={Link} href="/">
          <Image src="/logo.svg" alt="Foil" height="28px" />
        </Box>
        <Flex marginLeft="auto" gap={9} align="center" fontWeight="600">
          <Link href={`markets/31337:${Foil.address}`}>Subscribe</Link>
          <Link href={`markets/31337:${Foil.address}`}>Earn</Link>
          <Link href={`markets/31337:${Foil.address}`}>Markets</Link>
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
