'use client';

import { InfoOutlineIcon } from '@chakra-ui/icons';
import {
  Box,
  Heading,
  Link,
  Image,
  Flex,
  Text,
  Stat,
  StatArrow,
  StatGroup,
  StatHelpText,
  StatLabel,
  StatNumber,
  Divider,
} from '@chakra-ui/react';
import { format, formatDistanceToNow } from 'date-fns';
import { useContext } from 'react';
import { FaRegEye, FaRegChartBar, FaCubes } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { formatEther } from 'viem';

import { MarketContext } from '~/lib/context/MarketProvider';

const PositionsHeader = () => {
  const {
    chain,
    address,
    collateralAssetTicker,
    endTime,
    resolver,
    collateralAsset,
    baseAssetMinPrice,
    baseAssetMaxPrice,
  } = useContext(MarketContext);

  console.log('context', useContext(MarketContext));

  let relativeTime = '';
  let formattedTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime * 1000n);
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
    formattedTime = format(date, 'PPpp');
  }

  return (
    <Box mb={6} pt={4}>
      <Flex gap={8} mb={9} alignItems="center">
        <Image src="/assets/base-art.svg" width="160px" />
        <Box w="100%">
          <Heading mb={3}>
            {chain.name} Gas Market{' '}
            <Text ml={1.5} as="span" fontWeight="100" color="gray.600">
              Q2 2024
            </Text>
          </Heading>
          <Divider mb={5} borderColor="gray.300" />
          <StatGroup gap={0}>
            <Stat>
              <StatLabel>
                Current Price{' '}
                <InfoOutlineIcon
                  transform="translateY(-1px)"
                  color="gray.600"
                  height="3"
                />
              </StatLabel>
              <StatNumber>
                0.22{' '}
                <Text as="span" fontSize="sm" color="gray.700">
                  gwei
                </Text>
              </StatNumber>
              <StatHelpText>
                <StatArrow type="decrease" />
                9.36% (24hr)
              </StatHelpText>
            </Stat>

            <Stat>
              <StatLabel>
                Market Price{' '}
                <InfoOutlineIcon
                  transform="translateY(-1px)"
                  color="gray.600"
                  height="3"
                />
              </StatLabel>
              <StatNumber>
                0.19{' '}
                <Text as="span" fontSize="sm" color="gray.700">
                  gwei
                </Text>
              </StatNumber>
              <StatHelpText>
                <StatArrow type="decrease" />
                3.36% (24hr)
              </StatHelpText>
            </Stat>

            <Stat>
              <StatLabel>Liquidity</StatLabel>
              <StatNumber>
                12,000{' '}
                <Text as="span" fontSize="sm" color="gray.700">
                  Ggas
                </Text>
              </StatNumber>
              <StatHelpText>
                <StatArrow type="increase" />
                23.36%
              </StatHelpText>
            </Stat>

            <Stat>
              <StatLabel>Expiring In</StatLabel>
              <StatNumber>{relativeTime}</StatNumber>
              <StatHelpText>{formattedTime} UTC</StatHelpText>
            </Stat>
          </StatGroup>
        </Box>
      </Flex>

      <Box mb={6}>
        <Link
          fontSize="sm"
          color="gray.600"
          isExternal
          _hover={{ textDecoration: 'none' }}
          mr={9}
          mb={4}
          href={`${chain.blockExplorers?.default.url}/address/${address}`}
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
              sx={{ fontFamily: 'var(--font-spacemono-heavy)' }}
            >
              Contract
            </Text>
          </Flex>
        </Link>

        <Link
          fontSize="sm"
          color="gray.600"
          isExternal
          _hover={{ textDecoration: 'none' }}
          mr={9}
          mb={4}
          href={`${chain.blockExplorers?.default.url}/address/${collateralAsset}`}
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
              sx={{ fontFamily: 'var(--font-spacemono-heavy)' }}
            >
              Collateral
            </Text>
          </Flex>
        </Link>

        <Link
          fontSize="sm"
          color="gray.600"
          isExternal
          _hover={{ textDecoration: 'none' }}
          mr={9}
          mb={4}
          href={`${chain.blockExplorers?.default.url}/address/${resolver}`}
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
              sx={{ fontFamily: 'var(--font-spacemono-heavy)' }}
            >
              Resolver
            </Text>
          </Flex>
        </Link>

        <Text display="inline" fontSize="sm" color="gray.600" mr={6} mb={4}>
          <Flex display="inline-flex" alignItems="center">
            <Box display="inline-block" mr="1">
              <FaRegChartBar />
            </Box>
            <Text as="span" fontWeight="500" mr={1}>
              Allowed Range:
            </Text>{' '}
            {/* baseAssetMinPrice && formatEther(baseAssetMinPrice).toString() */}{' '}
            0.025 -{' '}
            {/* baseAssetMaxPrice && formatEther(baseAssetMaxPrice).toString() */}{' '}
            0.5 cbETH/Ggas
          </Flex>
        </Text>
      </Box>
    </Box>
  );
};

export default PositionsHeader;
