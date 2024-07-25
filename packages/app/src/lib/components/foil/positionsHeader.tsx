'use client';

import { InfoOutlineIcon } from '@chakra-ui/icons';
import {
  Box,
  Heading,
  Link,
  Flex,
  Text,
  Stat,
  StatArrow,
  StatGroup,
  StatHelpText,
  StatLabel,
  StatNumber,
} from '@chakra-ui/react';
import { format, formatDistanceToNow } from 'date-fns';
import { useContext } from 'react';
import { FaRegEye, FaRegChartBar, FaCubes } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';

import { MarketContext } from '~/lib/context/MarketProvider';

function tickToPrice(tick: number): number {
  const price: number = 1.0001 ** tick;
  return price;
}

const PositionsHeader = () => {
  const {
    chain,
    address,
    // collateralAssetTicker,
    endTime,
    collateralAsset,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
  } = useContext(MarketContext);

  const resolver = '0x0000'; // todo

  console.log('context', useContext(MarketContext));

  let relativeTime = '';
  let formattedTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime * 1000);
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
    formattedTime = format(date, 'PPpp');
  }

  return (
    <Flex gap={6} mb={9} alignItems="center" direction="column">
      <Flex w="100%" alignItems="center">
        <Heading>
          {chain?.name} Gas Market{' '}
          <Text ml={1.5} as="span" fontWeight="200" color="gray.600">
            Q2 2024
          </Text>
        </Heading>

        <Box ml="auto">
          <Link
            fontSize="sm"
            color="gray.800"
            isExternal
            _hover={{ textDecoration: 'none' }}
            mr={6}
            href={`${chain?.blockExplorers?.default.url}/address/${address}`}
          >
            <Flex display="inline-flex" alignItems="center">
              <Box display="inline-block" mr="1">
                <IoDocumentTextOutline />
              </Box>
              <Text
                borderBottom="1px dotted"
                borderRadius="1px"
                fontWeight="500"
                as="span"
              >
                Contract
              </Text>
            </Flex>
          </Link>

          <Link
            fontSize="sm"
            color="gray.800"
            isExternal
            _hover={{ textDecoration: 'none' }}
            mr={6}
            href={`${chain?.blockExplorers?.default.url}/address/${collateralAsset}`}
          >
            <Flex display="inline-flex" alignItems="center">
              <Box display="inline-block" mr="1">
                <FaCubes />
              </Box>
              <Text
                borderBottom="1px dotted"
                borderRadius="1px"
                fontWeight="500"
                as="span"
              >
                Collateral
              </Text>
            </Flex>
          </Link>

          <Link
            fontSize="sm"
            color="gray.800"
            isExternal
            _hover={{ textDecoration: 'none' }}
            href={`${chain?.blockExplorers?.default.url}/address/${resolver}`}
          >
            <Flex display="inline-flex" alignItems="center">
              <Box display="inline-block" mr="1">
                <FaRegEye />
              </Box>

              <Text
                borderBottom="1px dotted"
                borderRadius="1px"
                fontWeight="500"
                as="span"
              >
                Resolver
              </Text>
            </Flex>
          </Link>

          <Text fontSize="sm" color="gray.800" mt={1}>
            <Flex display="inline-flex" alignItems="center">
              <Box display="inline-block" mr="1">
                <FaRegChartBar />
              </Box>
              <Text as="span" fontWeight="500" mr={1}>
                Allowed Range:
              </Text>{' '}
              {tickToPrice(baseAssetMinPriceTick).toFixed(2)} cbETH/gGas -{' '}
              {tickToPrice(baseAssetMaxPriceTick).toFixed(2)} cbETH/gGas
            </Flex>
          </Text>
        </Box>
      </Flex>

      <StatGroup gap={6} w="100%">
        <Stat>
          <StatLabel fontSize="md">
            Current Price
            <InfoOutlineIcon
              transform="translateY(-2.5px)"
              color="gray.600"
              height="4"
              ml={1.5}
            />
          </StatLabel>
          <StatNumber>
            0.22 <Text as="span">gwei</Text>
          </StatNumber>
          <StatHelpText>
            <StatArrow type="decrease" color="red.500" />
            9.36% (24hr)
          </StatHelpText>
        </Stat>

        <Stat>
          <StatLabel fontSize="md">
            Market Price
            <InfoOutlineIcon
              transform="translateY(-2px)"
              color="gray.600"
              height="4"
              ml={1.5}
            />
          </StatLabel>
          <StatNumber>
            0.19 <Text as="span">gwei</Text>
          </StatNumber>
          <StatHelpText>
            <StatArrow type="decrease" color="red.500" />
            3.36% (24hr)
          </StatHelpText>
        </Stat>

        <Stat>
          <StatLabel fontSize="md">Liquidity</StatLabel>
          <StatNumber>
            12,000 <Text as="span">Ggas</Text>
          </StatNumber>
          <StatHelpText>
            <StatArrow type="increase" color="green.400" />
            23.36%
          </StatHelpText>
        </Stat>

        <Stat>
          <StatLabel fontSize="md">Ends In</StatLabel>
          <StatNumber>{relativeTime}</StatNumber>
          <StatHelpText>{formattedTime} UTC</StatHelpText>
        </Stat>
      </StatGroup>
    </Flex>
  );
};

export default PositionsHeader;
