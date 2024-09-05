/* eslint-disable import/no-extraneous-dependencies */
import FoilTestnet from '@/protocol/deployments/11155111/Foil.json';
import FoilLocal from '@/protocol/deployments/13370/Foil.json';
import { HamburgerIcon } from '@chakra-ui/icons';
import {
  Box,
  Flex,
  Image,
  IconButton,
  VStack,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import Link from 'next/link';
import React, { useState } from 'react';

import ConnectButton from '../components/ConnectButton';

const Header = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isMobile, setIsMobile] = useState(false);

  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // eslint-disable-next-line react/no-unstable-nested-components
  const NavLinks = () => (
    <>
      {process.env.NODE_ENV === 'development' && (
        <Link href={`/markets/13370:${FoilLocal.address}/1`}>Local Market</Link>
      )}
      <Link href={`/markets/11155111:${FoilTestnet.address}/1`}>
        Testnet Market
      </Link>
      <Link href="https://docs.foil.xyz">Docs</Link>
    </>
  );

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
        maxWidth="container.lg"
        align="center"
        px={3}
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
            <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
              <DrawerOverlay />
              <DrawerContent>
                <DrawerCloseButton />
                <DrawerHeader>Menu</DrawerHeader>
                <DrawerBody>
                  <VStack spacing={4} align="stretch">
                    <NavLinks />
                    <ConnectButton />
                  </VStack>
                </DrawerBody>
              </DrawerContent>
            </Drawer>
          </>
        ) : (
          <Flex gap={9} align="center" fontWeight="600">
            <NavLinks />
            <ConnectButton />
          </Flex>
        )}
      </Flex>
    </Box>
  );
};

export default Header;
