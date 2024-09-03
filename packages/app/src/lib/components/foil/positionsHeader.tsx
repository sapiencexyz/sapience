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
import { FaRegChartBar, FaCubes } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';

import { MarketContext } from '~/lib/context/MarketProvider';

const PositionsHeader = () => {
  const {
    chain,
    epoch,
    address,
    endTime,
    collateralAsset,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    averagePrice,
    pool,
    liquidity,
  } = useContext(MarketContext);

  let relativeTime = '';
  let formattedTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
    formattedTime = format(date, 'PPpp');
  }

  const tickToPrice = (tick: number): number => 1.0001 ** tick;

  return (
    <Flex gap={6} mb={9} alignItems="center" direction="column">
      <Flex w="100%" alignItems="end">
        <Heading>
          {chain?.name} Gas Market{' '}
          <Text ml={1.5} as="span" fontWeight="200" color="gray.600">
            Epoch {epoch}
          </Text>
        </Heading>

        <Box ml="auto">
          <Link
            fontSize="sm"
            color="gray.800"
            isExternal
            _hover={{ textDecoration: 'none' }}
            mr={5}
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
            mr={5}
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

          {pool && (
            <Flex display="inline-flex" align="center" fontSize="sm">
              <Box display="inline-block" mr="1">
                <FaRegChartBar />
              </Box>
              <Text as="span" fontWeight="500" mr={1}>
                Allowed Range:
              </Text>{' '}
              {tickToPrice(baseAssetMinPriceTick).toLocaleString()}-
              {tickToPrice(baseAssetMaxPriceTick).toLocaleString()} Ggas/wstETH
            </Flex>
          )}
        </Box>
      </Flex>

      <StatGroup gap={6} w="100%">
        <Stat>
          <StatLabel fontSize="md">
            Index Price
            <InfoOutlineIcon
              display="none"
              transform="translateY(-2.5px)"
              color="gray.600"
              height="4"
              ml={1.5}
            />
          </StatLabel>
          <StatNumber>
            {averagePrice.toLocaleString()}{' '}
            <Text fontSize="sm" as="span">
              Ggas/wstETH
            </Text>
          </StatNumber>
          {/*
          <StatHelpText>
            <StatArrow type="decrease" color="red.500" />
            9.36% (24hr)
          </StatHelpText>
          */}
        </Stat>

        <Stat>
          <StatLabel fontSize="md">
            Market Price
            <InfoOutlineIcon
              display="none"
              transform="translateY(-2px)"
              color="gray.600"
              height="4"
              ml={1.5}
            />
          </StatLabel>
          <StatNumber>
            {pool?.token0Price.toSignificant(3)}{' '}
            <Text fontSize="sm" as="span">
              Ggas/wstETH
            </Text>
          </StatNumber>
          {/*
          <StatHelpText>
            <StatArrow type="decrease" color="red.500" />
            3.36% (24hr)
          </StatHelpText>
          */}
        </Stat>

        <Stat>
          <StatLabel fontSize="md">
            Liquidity
            <InfoOutlineIcon
              display="none"
              transform="translateY(-2px)"
              color="gray.600"
              height="4"
              ml={1.5}
            />
          </StatLabel>
          <StatNumber>
            {liquidity}{' '}
            <Text fontSize="sm" as="span">
              Ggas
            </Text>
          </StatNumber>
          {/*
          <StatHelpText>
            <StatArrow type="increase" color="green.400" />
            23.36%
          </StatHelpText>
          */}
        </Stat>

        <Stat>
          <StatLabel fontSize="md">Ends In</StatLabel>
          <StatNumber>{relativeTime}</StatNumber>
          {/*
          <StatHelpText>{formattedTime} UTC</StatHelpText>
          */}
        </Stat>
      </StatGroup>
    </Flex>
  );
};

export default PositionsHeader;
