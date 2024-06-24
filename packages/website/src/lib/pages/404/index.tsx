import { Box, Heading, Flex } from '@chakra-ui/react';

const Page404 = () => {
  return (
    <Flex minHeight="70vh" direction="column" justifyContent="center">
      <Box marginY={4}>
        <Heading textAlign="center" size="lg">
          Page not Found
        </Heading>
      </Box>
    </Flex>
  );
};

export default Page404;
