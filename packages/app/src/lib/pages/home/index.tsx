'use client';

import { ChevronDownIcon, UpDownIcon } from '@chakra-ui/icons';
import {
  Spinner,
  Box,
  Flex,
  Heading,
  IconButton,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  VStack,
  Text,
} from '@chakra-ui/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';

import Subscribe from '~/lib/components/foil/subscribe';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { getChain } from '~/lib/util/util';

const HomeContent = () => {
  const [isMarketSelectorOpen, setIsMarketSelectorOpen] = useState(false);
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

  const handleMarketSelectorOpen = () => setIsMarketSelectorOpen(true);
  const handleMarketSelectorClose = () => setIsMarketSelectorOpen(false);

  const handleMarketSelect = (address: string, chain: number) => {
    updateParams(address, chain);
    handleMarketSelectorClose();
  };

  const marketName =
    markets.find((m) => m.address === marketAddress)?.name || 'Choose Market';

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
          <Flex alignItems="center" mb={2}>
            <Heading size="lg">
              {marketName.replace('Market', '')} Subscription
            </Heading>
            <IconButton
              ml="auto"
              aria-label="Change Market"
              size="xs"
              icon={<UpDownIcon />}
              onClick={handleMarketSelectorOpen}
            />
          </Flex>
          <Subscribe />
        </Box>
      </Flex>

      <Modal isOpen={isMarketSelectorOpen} onClose={handleMarketSelectorClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Select Market</ModalHeader>
          <ModalCloseButton />
          <ModalBody pt={0} pb={6}>
            <VStack spacing={2} align="stretch">
              {markets
                .filter((m) => m.public)
                .map((market) => (
                  <Flex
                    key={market.id}
                    justifyContent="space-between"
                    alignItems="center"
                    py={2}
                    px={4}
                    bg={
                      market.address === marketAddress
                        ? 'gray.100'
                        : 'transparent'
                    }
                    borderRadius="md"
                    cursor="pointer"
                    onClick={() =>
                      handleMarketSelect(market.address, market.chainId)
                    }
                    _hover={{ bg: 'gray.50' }}
                  >
                    <Text fontWeight="bold">{market.name}</Text>
                    <Text fontSize="sm" color="gray.600">
                      {getChain(market.chainId).name}
                    </Text>
                  </Flex>
                ))}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
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
