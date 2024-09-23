import {
  Box,
  Button,
  Heading,
  Image,
  Text,
  Link as ChakraLink,
  Flex,
} from '@chakra-ui/react';
import Link from 'next/link';

import MotionBox from '~/lib/components/motion/Box';

const Page404 = () => {
  return (
    <Flex minHeight="70vh" direction="column" w="100%" justifyContent="center">
      <Box m="auto" w="100%">
        <Heading textAlign="center" size="lg" mb={3}>
          404
        </Heading>
        <Heading textAlign="center" size="md">
          🖕
        </Heading>
      </Box>
    </Flex>
  );
};

export default Page404;
