'use client';

/* eslint-disable sonarjs/no-duplicate-string */

import {
  Flex,
  Box,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  HStack,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import Chart from '~/lib/components/chart';
import ChartSelector from '~/lib/components/ChartSelector';
import EpochHeader from '~/lib/components/foil/epochHeader';
import LiquidityPositionsTable from '~/lib/components/foil/liquidityPositionsTable';
import MarketSidebar from '~/lib/components/foil/marketSidebar';
import Stats from '~/lib/components/foil/stats';
import TraderPositionsTable from '~/lib/components/foil/traderPositionsTable';
import TransactionTable from '~/lib/components/foil/transactionTable';
import VolumeChart from '~/lib/components/VolumeChart';
import VolumeWindowSelector from '~/lib/components/VolumeWindowButtons';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { ChartType, VolumeWindow } from '~/lib/interfaces/interfaces';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const Market = ({ params }: { params: { id: string; epoch: string } }) => {
  const [selectedWindow, setSelectedWindow] = useState<VolumeWindow>(
    VolumeWindow.D
  );
  const [chartType, setChartType] = useState<ChartType>(ChartType.PRICE);

  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;
  const contractId = `${chainId}:${marketAddress}`;

  const useTransactions = () => {
    return useQuery({
      queryKey: ['transactions', contractId, epoch],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/transactions?contractId=${contractId}&epochId=${epoch}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: POLLING_INTERVAL,
    });
  };

  const useVolume = () => {
    return useQuery({
      queryKey: ['volume', contractId, epoch],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/volume?contractId=${contractId}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
    });
  };

  const {
    data: volume,
    error: useVolumeError,
    isLoading: isLoadingVolume,
    refetch: refetchVolume,
  } = useVolume();

  useEffect(() => {
    refetchVolume();
  }, [selectedWindow]);

  useEffect(() => {
    if (useVolumeError) {
      console.error('useVolumeError =', useVolumeError);
    }

    if (volume) {
      console.log('volume =', volume);
    }
  }, [volume, useVolumeError]);

  const {
    data: transactions,
    error: useTransactionsError,
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
  } = useTransactions();

  const useTradePositions = () => {
    return useQuery({
      queryKey: ['traderPositions', contractId],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/positions?contractId=${contractId}&isLP=false`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: POLLING_INTERVAL,
    });
  };

  const {
    data: tradePositions,
    error: tradePositionsError,
    isLoading: isLoadingTradePositions,
  } = useTradePositions();

  const useLiquidityPositions = () => {
    return useQuery({
      queryKey: ['liquidityPositions', contractId],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/positions?contractId=${contractId}&isLP=true`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: POLLING_INTERVAL,
    });
  };

  const {
    data: lpPositions,
    error: lpPositionsError,
    isLoading: isLoadingLpPositions,
  } = useLiquidityPositions();

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <Flex
        direction="column"
        w="full"
        h="calc(100vh - 64px)"
        overflow="hidden"
      >
        <EpochHeader />
        <Flex direction="column" flex={1} overflow="hidden">
          <Flex
            direction="column"
            flex={1}
            overflow="hidden"
            px={6}
            gap={8}
            flexDirection={{ base: 'column', md: 'row' }}
          >
            <Flex
              direction="column"
              w="100%"
              h="100%"
              overflow="hidden"
              id="chart-stat-flex"
            >
              <Box flexShrink={0}>
                <Stats />
              </Box>

              <Flex flex={1} id="chart-flex" minHeight={0}>
                {chartType === 'Price' ? (
                  <Chart />
                ) : (
                  <VolumeChart
                    data={volume || []}
                    activeWindow={selectedWindow}
                  />
                )}
              </Flex>
              <HStack
                justifyContent="space-between"
                width="100%"
                justify="center"
                mt={1}
                mb={3}
                flexShrink={0}
              >
                <VolumeWindowSelector
                  selectedWindow={selectedWindow}
                  setSelectedWindow={setSelectedWindow}
                />
                <ChartSelector
                  chartType={chartType}
                  setChartType={setChartType}
                />
              </HStack>
            </Flex>
            <Box
              width={{ base: '100%' }}
              maxWidth={{ base: 'none', md: '360px' }}
              pb={8}
            >
              <MarketSidebar />
            </Box>
          </Flex>
          <Flex
            borderTop="1px solid"
            borderColor="gray.200"
            height="172px"
            pt={1}
          >
            <Tabs display="flex" flexDirection="column" width="100%">
              <TabList>
                <Tab>Transactions</Tab>
                <Tab>Trader Positions</Tab>
                <Tab>LP Positions</Tab>
              </TabList>
              <TabPanels flexGrow={1} overflow="auto">
                <TabPanel>
                  <TransactionTable
                    isLoading={isLoadingTransactions}
                    error={useTransactionsError}
                    transactions={transactions}
                    contractId={contractId}
                  />
                </TabPanel>
                <TabPanel>
                  <TraderPositionsTable
                    isLoading={isLoadingTradePositions}
                    error={tradePositionsError}
                    positions={tradePositions}
                    contractId={contractId}
                  />
                </TabPanel>
                <TabPanel>
                  <LiquidityPositionsTable
                    isLoading={isLoadingLpPositions}
                    error={lpPositionsError}
                    positions={lpPositions}
                    contractId={contractId}
                  />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Flex>
        </Flex>
      </Flex>
    </MarketProvider>
  );
};

export default Market;
