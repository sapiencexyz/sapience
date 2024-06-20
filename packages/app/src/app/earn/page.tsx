import {
  Flex,
  FormControl,
  Box,
  Text,
  Heading,
  FormLabel,
  Select,
} from '@chakra-ui/react';

const Market = () => {
  return (
    <Flex direction="column" minHeight="70vh" my={8} gap={8} w="full">
      <Heading>Earn</Heading>
      <Box>
        <FormControl mb={6}>
          <FormLabel>Asset</FormLabel>
          <Select>
            <option value="option1" selected>
              wstETH
            </option>
            <option value="option2">TIA</option>
          </Select>
        </FormControl>

        <Heading size="sm" mb={1}>
          Estimated APY
        </Heading>
        <Box mb={6}>
          <Text display="inline" fontSize="2xl" mr={2}>
            X%
          </Text>
          <Text display="inline" color="gray.500">
            (wstETH denominated)
          </Text>
        </Box>
      </Box>

      <Flex>
        <Box>
          <Heading size="md" mb={2}>
            About
          </Heading>
          <Text>
            Provide liquidity at current price to current price x 2. Maybe has
            some auto roll feature.
          </Text>
        </Box>
        <Box
          padding={6}
          mb={4}
          border="1px solid"
          borderColor="gray.300"
          borderRadius="md"
        >
          input for adding/removing liquidity
        </Box>
      </Flex>
    </Flex>
  );
};

export default Market;
