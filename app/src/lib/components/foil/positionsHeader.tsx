'use client';

import { Box, Heading, Link } from '@chakra-ui/react';
import { formatDistanceToNow } from 'date-fns';
import { useContext } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

const PositionsHeader = () => {
  const { chain, address, collateralAssetTicker, endTime, resolver, collateralAsset, baseAssetMinPrice, baseAssetMaxPrice } =
    useContext(MarketContext);

    let relativeTime = '';
    let formattedTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime * 1000n);
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
    formattedTime = date.toLocaleString();
  }

  return (
    <Box>
      <Heading mb={2}>
        {chain.name} Gas Market
      </Heading>
      <Heading size="md" mb={5}>Expiring in {relativeTime} with {collateralAssetTicker} collateral</Heading>
        <Heading mb={2} fontWeight="normal" size="sm" color="gray.500">
        Contract:{' '}
        <Link
          isExternal
          borderBottom="1px dotted"
          _hover={{ textDecoration: 'none' }}
          href={`${chain.blockExplorers?.default.url}/address/${address}`}
        >
          {address}
        </Link>
      </Heading>
        <Heading mb={2} fontWeight="normal" size="sm" color="gray.500">
        Collateral:{' '}
        <Link
          isExternal
          borderBottom="1px dotted"
          _hover={{ textDecoration: 'none' }}
          href={`${chain.blockExplorers?.default.url}/address/${collateralAsset}`}
        >
          {collateralAsset}
        </Link>
      </Heading>
      <Heading mb={2} fontWeight="normal" size="sm" color="gray.500">
        Resolver:{' '}
        <Link
          isExternal
          borderBottom="1px dotted"
          _hover={{ textDecoration: 'none' }}
          href={`${chain.blockExplorers?.default.url}/address/${resolver}`}
        >
          {resolver}
        </Link>
        </Heading>
        <Heading mb={2} fontWeight="normal" size="sm" color="gray.500">
        Expiration: {formattedTime}
      </Heading>
        <Heading mb={5} fontWeight="normal" size="sm" color="gray.500">
        Allowed Range: {Number(baseAssetMinPrice)} - {Number(baseAssetMaxPrice)}
      </Heading>
    </Box>
  );
};

export default PositionsHeader;
