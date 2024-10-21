'use client';

import { Spinner, Box, Flex } from '@chakra-ui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { getChain } from '~/lib/util/util';

const HomeContent = () => {
  const { markets, isLoading } = useMarketList();
  const searchParams = useSearchParams();

  const chainIdParam = useMemo(
    () => searchParams.get('chainId'),
    [searchParams]
  );
  const marketAddressParam = useMemo(
    () => searchParams.get('marketAddress'),
    [searchParams]
  );
  const [chainId, setChainId] = useState<number>(
    chainIdParam ? Number(chainIdParam) : markets[0]?.chainId
  );
  const [marketAddress, setMarketAddress] = useState<string>(
    marketAddressParam || markets[0]?.address
  );

  useEffect(() => {
    if (marketAddressParam) {
      setMarketAddress(marketAddressParam);
    }
  }, [marketAddressParam]);

  useEffect(() => {
    if (chainIdParam) {
      setChainId(Number(chainIdParam));
    }
  }, [chainIdParam]);

  if (isLoading) {
    return (
      <Flex m={10} justifyContent="center" alignItems="center" w="100%">
        <Spinner />
      </Flex>
    );
  }
  return (
    <MarketProvider chainId={chainId} address={marketAddress} epoch={Number(1)}>
      <Flex
        w="100%"
        p={6}
        flexDirection="column"
        justify="center"
        alignItems="center"
      >
        <Box
          m="auto"
          border="1px solid"
          borderColor="gray.300"
          borderRadius="md"
          p={6}
          maxWidth="460px"
        >
          <Subscribe showMarketSwitcher />
        </Box>
      </Flex>
    </MarketProvider>
  );
};

const Home = () => {
  return (
    <Suspense fallback={<Spinner />}>
      <HomeContent />
    </Suspense>
  );
};

export default Home;
