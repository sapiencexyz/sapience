'use client';

import { Flex } from '@chakra-ui/react';

import LiquidityPositionHeader from '~/lib/components/foil/liquidityPositionHeader';
import LiquidityPositions from '~/lib/components/foil/liquidityPositions';
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
        <LiquidityPositionHeader />
        <LiquidityPositions />
      </Flex>
    </MarketProvider>
  );
};

export default Market;
