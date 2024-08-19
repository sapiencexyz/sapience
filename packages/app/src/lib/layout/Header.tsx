/* eslint-disable import/no-extraneous-dependencies */

import { Box, Flex, Image } from '@chakra-ui/react';
import Link from 'next/link';

import ConnectButton from '../components/ConnectButton';

import FoilTestnet from '@/protocol/deployments/11155111/Foil.json';
import FoilLocal from '@/protocol/deployments/13370/Foil.json';

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
          {/* <Link href="/subscribe">Subscribe</Link> */}
          {/* <Link href="/earn">Earn</Link> */}
          {process.env.NODE_ENV === 'development' && (
            <Link href={`/markets/13370:${FoilLocal.address}/1`}>
              Local Market
            </Link>
          )}
          <Link href={`/markets/11155111:${FoilTestnet.address}/1`}>
            Testnet Market
          </Link>
          <Link href="https://docs.foil.xyz">Docs</Link>
          <ConnectButton />
        </Flex>
      </Flex>
    </Box>
  );
};

export default Header;
