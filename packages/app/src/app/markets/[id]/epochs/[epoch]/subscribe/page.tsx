'use client';

import { Flex, Box } from '@chakra-ui/react';
import React from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import { MarketProvider } from '~/lib/context/MarketProvider';

const SubscribePage = ({
  params,
}: {
  params: { id: string; epoch: string };
}) => {
  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <Flex w="100%" py={6}>
        <Box
          m="auto"
          border="1px solid"
          borderColor="gray.300"
          borderRadius="md"
          p={6}
          maxWidth="480px"
        >
          <Subscribe />
        </Box>
      </Flex>
    </MarketProvider>
  );
};

export default SubscribePage;
