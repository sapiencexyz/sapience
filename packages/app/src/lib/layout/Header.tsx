import { HamburgerIcon, ChevronDownIcon } from '@chakra-ui/icons';
import {
  Box,
  Flex,
  Image,
  IconButton,
  VStack,
  Drawer,
  DrawerBody,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverArrow,
  PopoverBody,
  Link as ChakraLink,
} from '@chakra-ui/react';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import * as chains from 'viem/chains';

import ConnectButton from '../components/ConnectButton';
import { useMarketList } from '~/lib/context/MarketListProvider';

function getChain(chainId: number) {
  for (const chain of Object.values(chains)) {
    if (chain.id === chainId) {
      return chain;
    }
  }

  throw new Error(`Chain with id ${chainId} not found`);
}

// Move NavLinks component outside of Header
const NavLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const { markets, isLoading, error } = useMarketList();
  const [subscribePopoverOpen, setSubscribePopoverOpen] = useState(false);
  const [tradePopoverOpen, setTradePopoverOpen] = useState(false);

  const renderMarketLinks = (type: 'subscribe' | 'trade') => (
    <VStack align="stretch" mt={2} ml={isMobile ? 4 : 0}>
      {markets
        .filter((m) => m.public)
        .map((market) => (
          <Box key={market.id}>
            {type === 'subscribe' && market.nextEpoch && (
              <ChakraLink
                as={Link}
                href={`/markets/${market.chainId}:${market.address}/epochs/${market.nextEpoch.epochId}/subscribe`}
              >
                {getChain(market.chainId).name}
              </ChakraLink>
            )}
            {type === 'trade' && market.currentEpoch && (
              <ChakraLink
                as={Link}
                href={`/markets/${market.chainId}:${market.address}/epochs/${market.currentEpoch.epochId}`}
              >
                {getChain(market.chainId).name}
              </ChakraLink>
            )}
          </Box>
        ))}
    </VStack>
  );

  if (isMobile) {
    return (
      <VStack align="stretch" spacing={4}>
        <Box>
          <Box as="span" fontWeight="bold">
            Subscribe
          </Box>
          {renderMarketLinks('subscribe')}
        </Box>
        <Box>
          <Box as="span" fontWeight="bold">
            Trade
          </Box>
          {renderMarketLinks('trade')}
        </Box>
      </VStack>
    );
  }

  return (
    <Flex gap={9}>
      <Popover
        trigger="hover"
        isOpen={subscribePopoverOpen}
        onOpen={() => setSubscribePopoverOpen(true)}
        onClose={() => setSubscribePopoverOpen(false)}
      >
        <PopoverTrigger>
          <Box as="span" cursor="pointer" display="flex" alignItems="center">
            Subscribe <ChevronDownIcon ml={1} />
          </Box>
        </PopoverTrigger>
        <PopoverContent maxW="180px">
          <PopoverArrow />
          <PopoverBody py={3}>
            {markets
              .filter((m) => m.public)
              .map((market) => (
                <Box key={market.id}>
                  {market.nextEpoch && (
                    <ChakraLink
                      fontSize="sm"
                      as={Link}
                      width="100%"
                      display="block"
                      borderRadius="md"
                      px={3}
                      py={1.5}
                      _hover={{ bg: 'gray.50' }}
                      href={`/markets/${market.chainId}:${market.address}/epochs/${market.nextEpoch.epochId}/subscribe`}
                      onClick={() => setSubscribePopoverOpen(false)}
                    >
                      {getChain(market.chainId).name}
                    </ChakraLink>
                  )}
                </Box>
              ))}
          </PopoverBody>
        </PopoverContent>
      </Popover>

      <Popover
        trigger="hover"
        isOpen={tradePopoverOpen}
        onOpen={() => setTradePopoverOpen(true)}
        onClose={() => setTradePopoverOpen(false)}
      >
        <PopoverTrigger>
          <Box as="span" cursor="pointer" display="flex" alignItems="center">
            Trade <ChevronDownIcon ml={1} />
          </Box>
        </PopoverTrigger>
        <PopoverContent maxW="180px">
          <PopoverArrow />
          <PopoverBody py={3}>
            {markets.map((market) => (
              <Box key={market.id}>
                {market.currentEpoch && (
                  <ChakraLink
                    fontSize="sm"
                    as={Link}
                    width="100%"
                    display="block"
                    borderRadius="md"
                    px={3}
                    py={1.5}
                    _hover={{ bg: 'gray.50' }}
                    href={`/markets/${market.chainId}:${market.address}/epochs/${market.currentEpoch.epochId}`}
                    onClick={() => setTradePopoverOpen(false)}
                  >
                    {getChain(market.chainId).name}
                  </ChakraLink>
                )}
              </Box>
            ))}
          </PopoverBody>
        </PopoverContent>
      </Popover>
    </Flex>
  );
};

const Header = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <Box
      as="header"
      width="full"
      py={3}
      zIndex={3}
      bg="white"
      borderBottom="1px solid"
      borderColor="gray.300"
    >
      <Flex
        margin="0 auto"
        align="center"
        px={6}
        justifyContent="space-between"
      >
        <Box display="inline-block" as={Link} href="/">
          <Image src="/logo.svg" alt="Foil" height="28px" />
        </Box>
        {isMobile ? (
          <>
            <IconButton
              aria-label="Open menu"
              icon={<HamburgerIcon />}
              onClick={onOpen}
              variant="ghost"
            />
            <Drawer
              isOpen={isOpen}
              placement="right"
              onClose={onClose}
              size="sm"
            >
              <DrawerOverlay />
              <DrawerContent pt={4}>
                <DrawerCloseButton />
                <DrawerBody>
                  <VStack spacing={4} align="stretch">
                    <NavLinks isMobile />
                    <Link href="https://docs.foil.xyz">Docs</Link>
                    <ConnectButton />
                  </VStack>
                </DrawerBody>
              </DrawerContent>
            </Drawer>
          </>
        ) : (
          <Flex gap={6} align="center" fontWeight="600" w="100%">
            <Flex mx="auto">
              <NavLinks />
            </Flex>
            <Link href="https://docs.foil.xyz">Docs</Link>
            <ConnectButton />
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

export default Header;
