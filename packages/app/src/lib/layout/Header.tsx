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

const NavLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const { markets, isLoading, error } = useMarketList();
  const [tradePopoverOpen, setTradePopoverOpen] = useState(false);

  const renderTradeLinks = () => (
    <VStack align="stretch" mt={2} ml={isMobile ? 4 : 0}>
      {markets
        .filter((m) => m.public)
        .map((market) => (
          <Box key={market.id}>
            {market.currentEpoch && (
              <ChakraLink
                as={Link}
                href={`/markets/${market.chainId}:${market.address}/epochs/${market.currentEpoch.epochId}`}
              >
                {market.name}
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
          <ChakraLink as={Link} href="/">
            Subscribe
          </ChakraLink>
        </Box>
        <Box>
          <Box as="span" fontWeight="bold">
            Trade
          </Box>
          {renderTradeLinks()}
        </Box>
        <Box>
          <ChakraLink as={Link} href="https://docs.foil.xyz">
            Docs
          </ChakraLink>
        </Box>
      </VStack>
    );
  }

  return (
    <Flex gap={9}>
      <ChakraLink as={Link} href="/">
        Subscribe
      </ChakraLink>
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
        <PopoverContent maxW="220px">
          <PopoverArrow />
          <PopoverBody py={3}>
            {markets
              .filter((m) => m.public)
              .map((market) => (
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
                      {market.name}
                    </ChakraLink>
                  )}
                </Box>
              ))}
          </PopoverBody>
        </PopoverContent>
      </Popover>
      <ChakraLink as={Link} href="https://docs.foil.xyz">
        Docs
      </ChakraLink>
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
            <ConnectButton />
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

export default Header;
