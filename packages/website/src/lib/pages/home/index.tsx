import { Heading, Flex, Box } from '@chakra-ui/react';

import Blob from '~/lib/components/Blob';

const Home = () => {
  return (
    <Box position="relative" overflow="hidden" height="100dvh">
      <Flex
        position="relative"
        zIndex={2}
        direction="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100dvh"
        gap={[3, 3, 7]}
        maxWidth="820px"
        m="0 auto"
        textAlign="center"
        w="full"
        pt={[0, 0, 12]}
        px={4}
      >
        <Heading
          size={['2xl', '2xl', '4xl']}
          color="white"
          textShadow="1px 1px 3px #000000"
          lineHeight="1.15 !important"
        >
          Gas and Blobspace with Stable Pricing
        </Heading>
        <Heading
          size={['md', 'md', 'xl']}
          color="white"
          textShadow="1px 1px 3px #000000"
          mb={0}
          maxWidth="560px"
          fontWeight={600}
          lineHeight="1.15 !important"
        >
          Lock in your onchain costs regardless of network congestion
        </Heading>
      </Flex>{' '}
      <Box
        position="absolute"
        top="0"
        left="0"
        width="100dvw"
        height="100dvh"
        backgroundImage='url("/dotgrid.svg")'
        backgroundSize="45px 45px"
        backgroundRepeat="repeat"
        zIndex={2}
        opacity={0.25}
      />
      <Box position="fixed" top="0" left="0" zIndex={1} w="100dvw" h="100dvh">
        <Blob />
      </Box>
    </Box>
  );
};

export default Home;
