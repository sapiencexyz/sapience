import { Flex, Image, Box, Text, Heading, Button } from '@chakra-ui/react';
import Chart from '~/lib/components/chart';

const Market = () => {
  return (
    <Flex direction="column" minHeight="70vh" my={8} gap={8} w="full">
      <Flex alignItems="center">
        <Image src="assets/ethereum.svg" height="64px" mr={4} />
        <Box>
          <Heading mb={0}>Ethereum Mainnet Gas Market</Heading>
          <Text color="gray.500" mt={-1}>wstETH collateral</Text>
        </Box>
      </Flex>
      <Flex direction="row" w="100%">
      <Box width="75%" height="420px">
        <Chart />
      </Box>
      <Box>
        <Box mb={8} border="1px" borderColor="gray.500" p={3} borderRadius="md">
          <Heading size="xs" color="gray.700" textTransform="uppercase" letterSpacing=".02rem">Expiration</Heading>
          <Text>March 1st, 2024</Text>
        </Box>
        <Flex gap={4} mb={4}>
          <Button size="lg" rounded="md" w="100%" colorScheme="green">Buy</Button>
          <Button size="lg" rounded="md" w="100%" colorScheme="green">Sell</Button>
        </Flex>
        <Button size="sm" rounded="md" w="100%" colorScheme="purple">Provide Liquidity</Button>
      </Box>
      </Flex>
      <Box>
      <Box mb={4}>
        <Heading size="md">About</Heading>
        <Text>This market settles on March 1st, 2024 at midnight, using the price of gas according to an oracle.</Text>
      </Box>
      <Box mb={4}>
        <Heading size="md">Risks</Heading>
        <Text>Blah blah blah</Text>
      </Box>
      </Box>
    </Flex>
  );
};

export default Market;
