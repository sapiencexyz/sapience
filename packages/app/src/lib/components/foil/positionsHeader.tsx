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
import { SqrtPriceMath } from '@uniswap/v3-sdk';
import { format, formatDistanceToNow } from 'date-fns';
import JSBI from 'jsbi';
import { useContext } from 'react';
import { FaRegEye, FaRegChartBar, FaCubes } from 'react-icons/fa';
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
    marketPrice,
  } = useContext(MarketContext);

  // Calculate token amounts
  const sqrtPriceX96BigInt = JSBI.BigInt(pool?.sqrtRatioX96.toString() || 1);
  const liquidityBigInt = JSBI.BigInt(pool?.liquidity.toString() || 0);

  const token0Amount = SqrtPriceMath.getAmount0Delta(
    sqrtPriceX96BigInt,
    JSBI.add(sqrtPriceX96BigInt, JSBI.BigInt(1)), // Slightly higher price
    liquidityBigInt,
    false
  );

  console.log('context', useContext(MarketContext));

  let relativeTime = '';
  let formattedTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
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
            Epoch {epoch}
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

          {/*
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
          */}

          {pool && (
            <Box fontSize="sm" color="gray.800" mt={1}>
              <Flex display="inline-flex" alignItems="center">
                <Box display="inline-block" mr="1">
                  <FaRegChartBar />
                </Box>
                <Text as="span" fontWeight="500" mr={1}>
                  Allowed Range (Ticks):
                </Text>{' '}
                {baseAssetMinPriceTick}- {baseAssetMaxPriceTick}
              </Flex>
            </Box>
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
            {averagePrice} {/* <Text as="span">gwei</Text> */}
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
            {marketPrice.toFixed(2)}
            {/*  <Text as="span">gwei</Text> */}
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
            {token0Amount.toString()} {/* <Text as="span">Ggas</Text> */}
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
