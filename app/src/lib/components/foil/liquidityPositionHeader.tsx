'use client';

import { Box, Heading, Link } from '@chakra-ui/react';
import { formatDistanceToNow } from 'date-fns';
import { useContext } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

const LiquidityPositionHeader = () => {
  const { chain, address, collateralAssetTicker, endTime } =
    useContext(MarketContext);

  let relativeTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime * 1000n);
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
  }

  return (
    <Box>
      <Heading mb={2}>
        Provide {collateralAssetTicker} Liquidity for {chain.name} Gas
      </Heading>
      <Heading size="md" mb={3}>Expiring in {relativeTime}</Heading>
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
