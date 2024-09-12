/* eslint-disable sonarjs/no-duplicate-string */
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
  useBreakpointValue,
} from '@chakra-ui/react';
import { format, formatDistanceToNow } from 'date-fns';
import React, { useContext } from 'react';
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
    epochParams,
    averagePrice,
    pool,
    liquidity,
  } = useContext(MarketContext);

  const isMobile = useBreakpointValue({ base: true, md: false });
  const isTablet = useBreakpointValue({ base: false, md: true, lg: false });

  let relativeTime = '';
  let formattedTime = '';
  if (endTime) {
    const dateMilliseconds = Number(endTime) / 1000;
    const date = new Date(dateMilliseconds);
    console.log('endTime: ', endTime);
    console.log('date: ', date);
    relativeTime = formatDistanceToNow(date);
    formattedTime = format(date, 'PPpp');
  }

  const tickToPrice = (tick: number): number => 1.0001 ** tick;

  return (
    <Flex gap={6} mb={9} alignItems="center" direction="column" width="100%">
      <Flex
        w="100%"
        alignItems="flex-start"
        flexDirection={{ base: 'column', lg: 'row' }}
      >
        <Heading mb={0} alignSelf={{ base: 'flex-start', lg: 'flex-end' }}>
          {chain?.name} Gas Market{' '}
          <Text ml={1.5} as="span" fontWeight="200" color="gray.600">
            Epoch {epoch}
          </Text>
        </Heading>

        <Flex
          flexDirection="column"
          alignItems={{ base: 'flex-start', lg: 'flex-end' }}
          mt={{ base: 4, lg: 'auto' }}
          mb={{ base: 0, lg: 1 }}
          ml={{ lg: 'auto' }}
          width={{ base: '100%', lg: 'auto' }}
        >
          <Flex flexWrap="wrap" gap={{ base: 2, lg: 6 }}>
            <Link
              fontSize="sm"
              color="gray.800"
              isExternal
              _hover={{ textDecoration: 'none' }}
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

            <Flex display="inline-flex" align="center" fontSize="sm">
              <Box display="inline-block" mr="1">
                <FaRegChartBar />
              </Box>
              <Text as="span" fontWeight="500" mr={1}>
                Allowed Range:
              </Text>{' '}
              {tickToPrice(epochParams.baseAssetMinPriceTick).toLocaleString()}-
              {tickToPrice(epochParams.baseAssetMaxPriceTick).toLocaleString()}{' '}
              Ggas/wstETH
            </Flex>
          </Flex>
        </Flex>
      </Flex>

      <Flex
        gap={6}
        w="100%"
        flexDirection={{ base: 'column', md: 'row' }}
        flexWrap="wrap"
      >
        <Stat width={{ base: '100%', md: 'calc(50% - 12px)', lg: 'auto' }}>
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

        <Stat width={{ base: '100%', md: 'calc(50% - 12px)', lg: 'auto' }}>
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

        <Stat width={{ base: '100%', md: 'calc(50% - 12px)', lg: 'auto' }}>
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

        <Stat width={{ base: '100%', md: 'calc(50% - 12px)', lg: 'auto' }}>
          <StatLabel fontSize="md">Ends In</StatLabel>
          <StatNumber>{relativeTime}</StatNumber>
          {/*
          <StatHelpText>{formattedTime} UTC</StatHelpText>
          */}
        </Stat>
      </Flex>
    </Flex>
  );
};

export default PositionsHeader;
