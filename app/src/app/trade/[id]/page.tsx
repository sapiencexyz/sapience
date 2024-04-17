'use client';

import { Flex, Heading } from '@chakra-ui/react';

import TraderPositions from '~/lib/components/foil/traderPositions';

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
      <Heading mb={4}>Trade {params.id} Market</Heading>
      <TraderPositions />
    </Flex>
  );
};

export default Market;
