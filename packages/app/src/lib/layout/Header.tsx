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
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from '@chakra-ui/react';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';

import ConnectButton from '../components/ConnectButton';
import { useMarketList } from '~/lib/context/MarketListProvider';

const NavPopover = ({ label, path, withEpochs = false }: { label: string, path: string, withEpochs?: boolean }) => {
  const [hoveredMarket, setHoveredMarket] = useState<number | null>(null);
  const { markets } = useMarketList();

  const formatTimestamp = (timestamp: number) => {
    return format(new Date(timestamp * 1000), 'MMM d, HH:mm');
  };

  useEffect(() => {
    if (withEpochs && markets.length > 0) {
      setHoveredMarket(markets[0].id);
    }
  }, [withEpochs, markets]);

  return (
    <Popover trigger="hover">
      <PopoverTrigger>
        <Box as="span" cursor="pointer" display="flex" alignItems="center">
          {label} <ChevronDownIcon ml={1} />
        </Box>
      </PopoverTrigger>
      <PopoverContent maxW={withEpochs ? "400px" : "220px"}>
        <PopoverArrow />
        <PopoverBody py={3}>
          <Flex>
            <Box flex={1}>
              {markets
                .filter((m) => m.public)
                .map((market) => (
                  <Box
                    key={market.id}
                    onMouseEnter={() => withEpochs && setHoveredMarket(market.id)}
                    onMouseLeave={() => withEpochs && setHoveredMarket(markets[0].id)}
                  >
                    {market.currentEpoch && (
                      <ChakraLink
                        fontSize="sm"
                        as={Link}
                        width="100%"
                        display="block"
                        borderRadius="md"
                        px={3}
                        py={1.5}
                        bg={withEpochs && hoveredMarket === market.id ? 'gray.100' : 'transparent'}
                        _hover={{ bg: 'gray.100' }}
                        href={path === 'earn'
                          ? `/${path}/${market.chainId}:${market.address}`
                          : withEpochs
                            ? `/${path}/${market.chainId}:${market.address}`
                            : `/${path}/${market.chainId}:${market.address}/epochs/${market.currentEpoch.epochId}`
                        }
                      >
                        {market.name}
                      </ChakraLink>
                    )}
                  </Box>
                ))}
            </Box>
            {withEpochs && (
              <Box flex={1} borderLeft="1px" borderColor="gray.200" pl={3} ml={3}>
                {hoveredMarket && (
                  <VStack align="stretch" spacing={1}>
                    {markets
                      .find(m => m.id === hoveredMarket)
                      ?.epochs.map(epoch => (
                        <ChakraLink
                          key={epoch.epochId}
                          fontSize="sm"
                          as={Link}
                          width="100%"
                          display="block"
                          borderRadius="md"
                          px={3}
                          py={1.5}
                          _hover={{ bg: 'gray.50' }}
                          href={`/${path}/${markets.find(m => m.id === hoveredMarket)?.chainId}:${markets.find(m => m.id === hoveredMarket)?.address}/epochs/${epoch.epochId}`}
                        >
                          {formatTimestamp(epoch.startTimestamp)} - {formatTimestamp(epoch.endTimestamp)}
                        </ChakraLink>
                      ))}
                  </VStack>
                )}
              </Box>
            )}
          </Flex>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

const NavLinks = ({ isMobile = false }: { isMobile?: boolean }) => {
  const { markets } = useMarketList();

  const formatTimestamp = (timestamp: number) => {
    return format(new Date(timestamp * 1000), 'MMM d, HH:mm');
  };

  const renderMobileMarketLinks = (path: string, withEpochs = false) => (
    <Accordion allowMultiple>
      {markets
        .filter((m) => m.public)
        .map((market) => (
          <AccordionItem key={market.id} border="none">
            {({ isExpanded }) => (
              <>
                <h2>
                  <AccordionButton
                    p={0}
                    _hover={{ bg: 'transparent' }}
                    justifyContent="space-between"
                  >
                    <ChakraLink
                      as={Link}
                      href={path === 'earn'
                        ? `/${path}/${market.chainId}:${market.address}`
                        : withEpochs
                          ? `/${path}/${market.chainId}:${market.address}`
                          : `/${path}/${market.chainId}:${market.address}/epochs/${market.currentEpoch?.epochId}`
                      }
                      onClick={(e) => withEpochs && e.preventDefault()}
                    >
                      {market.name}
                    </ChakraLink>
                    {withEpochs && (
                      <ChevronDownIcon
                        transform={isExpanded ? 'rotate(180deg)' : undefined}
                        transition="transform 0.2s"
                      />
                    )}
                  </AccordionButton>
                </h2>
                {withEpochs && (
                  <AccordionPanel pb={4} pl={4}>
                    <VStack align="stretch" spacing={2}>
                      {market.epochs.map(epoch => (
                        <ChakraLink
                          key={epoch.epochId}
                          fontSize="sm"
                          as={Link}
                          href={`/${path}/${market.chainId}:${market.address}/epochs/${epoch.epochId}`}
                        >
                          {formatTimestamp(epoch.startTimestamp)} - {formatTimestamp(epoch.endTimestamp)}
                        </ChakraLink>
                      ))}
                    </VStack>
                  </AccordionPanel>
                )}
              </>
            )}
          </AccordionItem>
        ))}
    </Accordion>
  );

  if (isMobile) {
    return (
      <VStack align="stretch" spacing={4}>
        <Box>
          <Box fontWeight="bold" mb={1}>Subscribe</Box>
          {renderMobileMarketLinks('subscribe')}
        </Box>
        <Box>
          <Box fontWeight="bold" mb={1}>Earn</Box>
          {renderMobileMarketLinks('earn')}
        </Box>
        <Box>
          <Box fontWeight="bold" mb={1}>Trade</Box>
          {renderMobileMarketLinks('trade', true)}
        </Box>
        <Box>
          <Box fontWeight="bold" mb={1}>Pool</Box>
          {renderMobileMarketLinks('pool', true)}
        </Box>
        <ChakraLink as={Link} href="https://docs.foil.xyz">
          Docs
        </ChakraLink>
      </VStack>
    );
  }

  return (
    <Flex gap={9}>
      <NavPopover label="Subscribe" path="subscribe" />
      <NavPopover label="Earn" path="earn" />
      <NavPopover label="Trade" path="trade" withEpochs={true} />
      <NavPopover label="Pool" path="pool" withEpochs={true} />
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
