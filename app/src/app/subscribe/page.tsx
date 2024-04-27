'use client';

import { InfoOutlineIcon } from '@chakra-ui/icons';
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
  Text,
  Divider,
  Stat,
  StatArrow,
  StatGroup,
  StatHelpText,
  StatLabel,
  StatNumber,
  Image,
  Slider,
  SliderFilledTrack,
  SliderMark,
  SliderThumb,
  SliderTrack,
} from '@chakra-ui/react';
import { FaCubes, FaRegEye, FaRegChartBar } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { formatEther } from 'viem';

const labelStyles = {
  mt: '2',
  transform: 'translateX(-50%)',
  fontSize: 'sm',
  color: 'gray.700'
};

const Market = () => {
  return (
    <Box
      border="1px solid"
      borderColor="gray.200"
      maxW="container.sm"
      m="auto"
      borderRadius="md"
      boxShadow="md"
      p={8}
    >
      <Box mb={6}>
        <Flex gap={8} mb={8} alignItems="center">
          <Image src="/assets/base-art.svg" width="160px" />
          <Box w="100%">
            <Heading mb={4}>Base Gas Subscription</Heading>
            <Divider mb={4} borderColor="gray.300" />
            <Text fontSize="md" color="gray.600">
              Use Foil to lock in a gas price. You can redeem a rebate of cbETH
              if average gas costs exceed what you’re quoted over the duration
              of your subscription.
            </Text>
          </Box>
        </Flex>
      </Box>
      <form>
        <FormControl mb={8}>
          <FormLabel>Duration</FormLabel>
          <Box pb={4}>
            <Slider
              step="25"
              aria-label="slider-ex-6"
              onChange={(val) => setSliderValue(val)}
            >
              <SliderMark value={0} {...labelStyles}>
                May
              </SliderMark>
              <SliderMark value={25} {...labelStyles}>
                June
              </SliderMark>
              <SliderMark value={50} {...labelStyles}>
                July
              </SliderMark>
              <SliderMark value={75} {...labelStyles}>
                August
              </SliderMark>
              <SliderMark value={100} {...labelStyles}>
                Sept.
              </SliderMark>
              <SliderTrack>
                <SliderFilledTrack />
              </SliderTrack>
              <SliderThumb />
            </Slider>
          </Box>
        </FormControl>

        <FormControl mb={8}>
          <Flex>
            <FormLabel>Quantity</FormLabel>
            <Box ml="auto">
              <Link
                borderBottom="1px dotted"
                height="auto"
                fontSize="xs"
                color="gray.500"
              >
                Estimate based on wallet usage
              </Link>
            </Box>
          </Flex>
          <InputGroup>
            <Input />
            <InputRightAddon>GigaGas per month</InputRightAddon>
          </InputGroup>
          <FormHelperText>
            <strong>Total:</strong> 420,420,420,420.00 gas units
          </FormHelperText>
        </FormControl>

        <Box borderLeft="4px solid" borderLeftColor="#0053ff" bg="#f5f7ff" mb={8} p={6}>
          <Heading size="sm" color="gray.700" mb={1.5}>Quote</Heading>

          <Text display="inline" fontSize="2xl" mr={2}>
            31 cbETH
          </Text>
          <Text display="inline" color="gray.500">
            (20 gwei per gas unit)
          </Text>
        </Box>

        <Button size="lg" rounded="md" w="100%" bg="#0053ff" color="white">
          Subscribe
        </Button>
      </form>
    </Box>
  );
};

/*
const Market = () => {
  return (
    <Flex direction="column" minHeight="70vh" my={8} gap={8} w="full">
      <Box
        padding={6}
        mb={4}
        border="1px solid"
        borderColor="gray.200"
        borderRadius="md"
      >
        <Heading size="md" mb={4}>
          Create Subscription
        </Heading>

        <Text mb={4}>
          Use Foil to lock in a gas price over the period of your subscription.
          If gas costs more than this on average over this period, you can
          redeem more wstETH than paid. If less, vice versa.
        </Text>

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
            <option value="option2">44 days (ending April 1st)</option>
            <option value="option3">74 days (ending May 1st)</option>
          </Select>
        </FormControl>

        <FormControl mb={8}>
          <Flex>
            <FormLabel>Amount of Gas</FormLabel>
            <Link textDecoration="underline" ml="auto" fontSize="sm">
              Estimate based on wallet usage
            </Link>
          </Flex>
          <InputGroup>
            <Input />
            <InputRightAddon>GigaGas</InputRightAddon>
          </InputGroup>
          <FormHelperText>This is 1,232,323 gas units</FormHelperText>
        </FormControl>

        <Box mb={6}>
          <Heading size="sm" mb={2}>
            This gas would get you this much per day over the course of your
            subscription
          </Heading>
          <Flex>
            <Box flex={1}>X Swap txs</Box>
            <Box flex={1}>X NFT Sale txs</Box>
            <Box flex={1}>X Bridge txs</Box>
            <Box flex={1}>X Borrow txs</Box>
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

      <Box
        padding={6}
        mb={4}
        border="1px solid"
        borderColor="gray.200"
        borderRadius="md"
      >
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
          <Button
            isDisabled
            size="lg"
            rounded="md"
            w="100%"
            colorScheme="green"
          >
            Redeem
          </Button>
          <Button
            isDisabled
            size="lg"
            rounded="md"
            w="100%"
            colorScheme="green"
          >
            Renew
          </Button>
        </Flex>
        <Box textAlign="center" mt={2}>
          <Link textDecoration="underline" fontSize="sm">
            Manage in pro mode
          </Link>
        </Box>
      </Box>
    </Flex>
  );
};
*/

export default Market;
