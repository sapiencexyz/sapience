import { Flex, Heading } from '@chakra-ui/react';

const Home = () => {
  return (
    <Flex
      direction="column"
      alignItems="center"
      minHeight="70vh"
      gap={4}
      mb={8}
      w="full"
    >
      <Heading size="xl" m="auto" px={24} textAlign="center">
        Put on your foil hat and start trading gas futures, bitches
      </Heading>
    </Flex>
  );
};

export default Home;
