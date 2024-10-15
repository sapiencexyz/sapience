'use client';

import { ChevronDownIcon } from '@chakra-ui/icons';
import {
  Spinner,
  Box,
  Flex,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
  Link as ChakraLink,
} from '@chakra-ui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { getChain } from '~/lib/util/util';

const Home = () => {
  const [subscribePopoverOpen, setSubscribePopoverOpen] = useState(false);
  const { markets, isLoading } = useMarketList();
  const searchParams = useSearchParams();
  const router = useRouter();

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
    if (markets.length > 0 && (!marketAddressParam || !chainIdParam)) {
      updateParams(markets[0].address, markets[0].chainId);
    }
  }, [markets, marketAddressParam, chainIdParam]);

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

  const updateParams = (address: string, chain: number) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set('marketAddress', address);
    current.set('chainId', chain.toString());
    const search = current.toString();
    const query = search ? `?${search}` : '';
    router.push(`${window.location.pathname}${query}`);
  };

  const handlePopoverClick = (address: string, chain: number) => {
    updateParams(address, chain);
    setSubscribePopoverOpen(false);
  };

  const marketName =
    markets.find((m) => m.address === marketAddress)?.name || 'Choose Market';

  if (isLoading) {
    return (
      <Flex m={10} justifyContent="center" alignItems="center" w="100%">
        Loading Markets...
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
        <Popover
          trigger="hover"
          isOpen={subscribePopoverOpen}
          onOpen={() => setSubscribePopoverOpen(true)}
          onClose={() => setSubscribePopoverOpen(false)}
        >
          <PopoverTrigger>
            <Box as="span" cursor="pointer" display="flex" alignItems="center">
              {marketName} <ChevronDownIcon ml={1} />
            </Box>
          </PopoverTrigger>
          <PopoverContent maxW="280px">
            <PopoverArrow />
            <PopoverBody py={3}>
              {markets
                .filter((m) => m.public)
                .map((market) => (
                  <Box key={market.id}>
                    {market.nextEpoch && (
                      <ChakraLink
                        fontSize="sm"
                        width="100%"
                        display="block"
                        borderRadius="md"
                        px={3}
                        py={1.5}
                        _hover={{ bg: 'gray.50' }}
                        onClick={() =>
                          handlePopoverClick(market.address, market.chainId)
                        }
                      >
                        {market.name} ({getChain(market.chainId).name})
                      </ChakraLink>
                    )}
                  </Box>
                ))}
            </PopoverBody>
          </PopoverContent>
        </Popover>
        <Box
          m="auto"
          border="1px solid"
          borderColor="gray.300"
          borderRadius="md"
          p={6}
          maxWidth="432px"
        >
          <Subscribe />
        </Box>
      </Flex>
    </MarketProvider>
  );
};

export default Home;
