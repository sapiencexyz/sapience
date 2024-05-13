'use client';

import { Flex } from '@chakra-ui/react';

import Positions from '~/lib/components/foil/positions';
import PositionsHeader from '~/lib/components/foil/positionsHeader';
import { MarketProvider } from '~/lib/context/MarketProvider';

const Market = ({ params }: { params: { id: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <MarketProvider chainId={Number(chainId)} address={marketAddress}>
      <Flex
        direction="column"
        alignItems="left"
        minHeight="70vh"
        mb={8}
        w="full"
        py={8}
      >
        <PositionsHeader />
        <Positions />
      </Flex>
    </MarketProvider>
  );
};

export default Market;
