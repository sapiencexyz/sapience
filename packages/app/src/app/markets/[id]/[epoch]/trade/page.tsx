'use client';

import { Flex } from '@chakra-ui/react';

import TraderPositions from '~/lib/components/foil/traderPositions';
import { MarketProvider } from '~/lib/context/MarketProvider';

const Market = ({ params }: { params: { id: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <MarketProvider chainId={Number(chainId)} address={marketAddress}>
      <Flex
        direction="column"
        alignItems="left"
        minHeight="70vh"
        gap={4}
        mb={8}
        w="full"
        py={8}
      >
        <TraderPositions />
      </Flex>
    </MarketProvider>
  );
};

export default Market;
