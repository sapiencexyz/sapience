/* eslint-disable sonarjs/no-duplicate-string */
import { InfoOutlineIcon } from '@chakra-ui/icons';
import {
  Flex,
  Text,
  Stat,
  StatLabel,
  StatNumber,
  Tooltip,
} from '@chakra-ui/react';
import { format, formatDistanceToNow } from 'date-fns';
import React, { useContext } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';
import { convertToGwei } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';

const Stats = () => {
  const {
    startTime,
    endTime,
    averagePrice,
    pool,
    liquidity,
    useMarketUnits,
    stEthPerToken,
  } = useContext(MarketContext);

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
    const now = new Date();
    relativeTime = date < now ? 'Expired' : formatDistanceToNow(date);
    formattedTime = format(date, 'PPpp');
    endTimeString = format(date, 'PPpp');
  }

  return (
    <Flex alignItems="center" direction="column" width="100%" pb={6}>
      <Flex
        gap={6}
        w="100%"
        flexDirection={{ base: 'column', md: 'row' }}
        flexWrap="wrap"
      >
        <Stat width={{ base: '100%', md: 'calc(50% - 12px)', lg: 'auto' }}>
          <StatLabel fontSize="md">
            Index Price
            <Tooltip label="Expected settlement price based on the current time-weighted average underlying price for this epoch.">
              <InfoOutlineIcon
                transform="translateY(-2.5px)"
                color="gray.600"
                height="4"
                ml={1.5}
              />
            </Tooltip>
          </StatLabel>
          <StatNumber>
            <NumberDisplay
              value={
                useMarketUnits
                  ? averagePrice
                  : convertToGwei(averagePrice, stEthPerToken)
              }
            />{' '}
            <Text fontSize="sm" as="span">
              {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
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
            <Tooltip label="Current price in the Foil liquidity pool for this epoch.">
              <InfoOutlineIcon
                transform="translateY(-2px)"
                color="gray.600"
                height="4"
                ml={1.5}
              />
            </Tooltip>
          </StatLabel>
          <StatNumber>
            <NumberDisplay
              value={
                useMarketUnits
                  ? pool?.token0Price.toSignificant(18) || 0
                  : convertToGwei(
                      Number(pool?.token0Price.toSignificant(18) || 0),
                      stEthPerToken
                    )
              }
            />{' '}
            <Text fontSize="sm" as="span">
              {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
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
            <NumberDisplay value={liquidity} />{' '}
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

export default Stats;
