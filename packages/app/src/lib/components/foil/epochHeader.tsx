/* eslint-disable sonarjs/no-duplicate-string */
import { Box, Heading, Link, Flex, Text } from '@chakra-ui/react';
import { format, formatDistanceToNow } from 'date-fns';
import React, { useContext } from 'react';
import { FaRegChartBar, FaCubes, FaRegCalendar } from 'react-icons/fa';
import { IoDocumentTextOutline } from 'react-icons/io5';
import { MarketContext } from '~/lib/context/MarketProvider';
import { tickToPrice } from '~/lib/util/util';
const PositionsHeader = () => {
  const { chain, address, collateralAsset, epochParams, startTime, endTime } =
    useContext(MarketContext);

  let relativeTime = '';
  let formattedTime = '';
  let endTimeString = '';
  let startTimeString = '';
  if (startTime) {
    const dateMilliseconds = Number(startTime) * 1000;
    const date = new Date(dateMilliseconds);
    startTimeString = format(date, 'PPpp');
  }
  if (endTime) {
    const dateMilliseconds = Number(endTime) * 1000;
    const date = new Date(dateMilliseconds);
    relativeTime = formatDistanceToNow(date);
    formattedTime = format(date, 'PPpp');
    endTimeString = format(date, 'PPpp');
  }

  return (
    <Flex alignItems="center" direction="column" width="100%">
      <Flex
        w="100%"
        alignItems="flex-start"
        flexDirection={{ base: 'column', lg: 'row' }}
        px={6}
        py={4}
      >
        <Heading
          size="lg"
          mb={0}
          alignSelf={{ base: 'flex-start', lg: 'flex-end' }}
        >
          {chain?.name} Gas Market{' '}
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
                Contract Price Range:
              </Text>{' '}
              {tickToPrice(epochParams.baseAssetMinPriceTick).toLocaleString()}-
              {tickToPrice(epochParams.baseAssetMaxPriceTick).toLocaleString()}{' '}
              Ggas/wstETH
            </Flex>

            <Flex display="inline-flex" align="center" fontSize="sm">
              <Box display="inline-block" mr="1">
                <FaRegCalendar opacity={0.8} />
              </Box>
              <Text as="span" fontWeight="500" mr={1}>
                Period:
              </Text>{' '}
              {startTimeString} - {endTimeString}
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
};

export default PositionsHeader;
