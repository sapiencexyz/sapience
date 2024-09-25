import { HamburgerIcon } from '@chakra-ui/icons';
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
} from '@chakra-ui/react';
import Link from 'next/link';
import React, { useState, useEffect } from 'react';

import ConnectButton from '../components/ConnectButton';
import useFoilDeployment from '../components/foil/useFoilDeployment';

const Header = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [isMobile, setIsMobile] = useState(false);
  const { foilData: testnetFoilData } = useFoilDeployment(11155111);
  const { foilData: localFoilData } = useFoilDeployment(13370);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // eslint-disable-next-line react/no-unstable-nested-components
  const NavLinks = () => (
    <>
      {process.env.NODE_ENV === 'development' && localFoilData?.address && (
        <Link href={`/markets/13370:${localFoilData.address}/epochs/1`}>
          Local Market
        </Link>
      )}
      {testnetFoilData?.address && (
        <Link href={`/markets/11155111:${testnetFoilData.address}/epochs/1`}>
          Testnet Market
        </Link>
      )}
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
            <Drawer isOpen={isOpen} placement="right" onClose={onClose}>
              <DrawerOverlay />
              <DrawerContent>
                <DrawerCloseButton />
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
