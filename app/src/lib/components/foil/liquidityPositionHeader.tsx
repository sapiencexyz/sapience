'use client';

import { Box, Heading, Link } from '@chakra-ui/react';
import { useContext } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

const LiquidityPositionHeader = () => {
  const { chain, address, collateralAssetTicker } = useContext(MarketContext);

  return (
    <Box>
      <Heading mb={3}>
        Provide {collateralAssetTicker} Liquidity for {chain.name} Gas
      </Heading>
      <Heading mb={5} fontWeight="normal" size="sm" color="gray.500">
        Market Address:{' '}
        <Link
          isExternal
          borderBottom="1px dotted"
          _hover={{ textDecoration: 'none' }}
          href={`${chain.blockExplorers?.default.url}/address/${address}`}
        >
          {address}
        </Link>
      </Heading>
    </Box>
  );
};

export default LiquidityPositionHeader;
