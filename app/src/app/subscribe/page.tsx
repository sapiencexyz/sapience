'use client';

import {
  Flex,
  Select,
  Box,
  Heading,
  Button,
  FormLabel,
  FormControl,
  Input,
  InputGroup,
  InputRightAddon,
  FormHelperText,
  Link,
  Text
} from '@chakra-ui/react';

const Market = () => {
  return (
    <Flex direction="column" minHeight="70vh" my={8} gap={8} w="full">
      <Box padding={6} mb={4} border="1px solid" borderColor="gray.200" borderRadius="md">
        <Heading size="md" mb={4}>
          Create Subscription
        </Heading>

        <Text mb={4}>Use Foil to lock in a gas price over the period of your subscription. If gas costs more than this on average over this period, you can redeem more wstETH than paid. If less, vice versa.</Text>

        <FormControl mb={4}>
          <FormLabel>Asset</FormLabel>
          <Select>
            <option value="option1" selected>
              ETH Mainnet Gas (wstETH Collateral)
            </option>
            <option value="option2">
              Celestia Blobspace Gas (TIA collateral)
            </option>
          </Select>
        </FormControl>
        <FormControl mb={4}>
          <FormLabel>Duration</FormLabel>
          <Select>
            <option value="option1" selected>
              14 days (ending March 1st)
            </option>
            <option value="option2">
              44 days (ending April 1st)
            </option>
            <option value="option3">
              74 days (ending May 1st)
            </option>
          </Select>
        </FormControl>

        <FormControl mb={8}>
          <Flex>
          <FormLabel>Amount of Gas</FormLabel>
          <Link textDecoration="underline" ml="auto" fontSize="sm">Estimate based on wallet usage</Link>
          </Flex>
          <InputGroup>
            <Input />
            <InputRightAddon>GigaGas</InputRightAddon>
          </InputGroup>
          <FormHelperText>This is 1,232,323 gas units</FormHelperText>
        </FormControl>

        <Box mb={6}>
          <Heading size="sm" mb={2}>This gas would get you this much per day over the course of your subscription</Heading>
          <Flex>
            <Box  flex={1}>
              X Swap txs
            </Box>
            <Box  flex={1}>
              X NFT Sale  txs
            </Box>
            <Box  flex={1}>
              X Bridge txs
            </Box>
            <Box  flex={1}>
              X Borrow txs
            </Box>
          </Flex>
        </Box>

        <Heading size="sm" mb={1}>
          Quote
        </Heading>
        <Box mb={6}>
        <Text display="inline" fontSize="2xl" mr={2}>
          3 wstETH
        </Text>
        <Text display="inline" color="gray.500">
          (20 gwei per gas unit)
        </Text>
        </Box>
        
        <Button size="lg" rounded="md" w="100%" colorScheme="green">
          Subscribe
        </Button>
      </Box>

      <Box padding={6} mb={4} border="1px solid" borderColor="gray.200" borderRadius="md">
        <Heading size="md" mb={4}>
          Manage Subscription
        </Heading>
        <FormControl mb={4}>
          <FormLabel>Asset</FormLabel>
          <Select isDisabled>
            <option value="option1" selected>
              ETH Mainnet Gas (wstETH Collateral)
            </option>
            <option value="option2">
              Celestia Blobspace Gas (TIA collateral)
            </option>
          </Select>
        </FormControl>
        <Flex mb={4} gap={8}>
        <Box w="100%">
        <Heading size="sm" mb={1}>
          Estimated Redemption Value
        </Heading>
        <Text display="inline" fontSize="2xl" mr={2}>
          3.2 wstETH
        </Text>
        <Text display="inline" color="gray.500">
          (24 gwei per gas unit)
        </Text>
        </Box>
        <Box w="100%">
        <Heading size="sm" mb={1}>
          Time Remaining
        </Heading>
        <Text display="inline" fontSize="2xl" mr={2}>
          3 days
        </Text>
        </Box>
        </Flex>
        <Flex gap={4}>
        <Button isDisabled size="lg" rounded="md" w="100%" colorScheme="green">
          Redeem
        </Button>
        <Button isDisabled size="lg" rounded="md" w="100%" colorScheme="green">
          Renew
        </Button>
        </Flex>
        <Box textAlign="center" mt={2}>
          <Link textDecoration="underline" fontSize="sm">Manage in pro mode</Link>
        </Box>
      </Box>
    </Flex>
  );
};

export default Market;
