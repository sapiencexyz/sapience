'use client';

import { Flex, Heading } from '@chakra-ui/react';

import AddLiquidity from '~/lib/components/foil/addLiquidity';
import LiquidityPositions from '~/lib/components/foil/liquidityPositions';

const Market = ({ params }: { params: { id: string } }) => {
  return (
    <Flex
      direction="column"
      alignItems="left"
      minHeight="70vh"
      gap={4}
      mb={8}
      w="full"
      py={8}
    >
      <Heading mb={4}>{params.id} Market</Heading>
      <LiquidityPositions />
      <AddLiquidity />
    </Flex>
  );
};

export default Market;
