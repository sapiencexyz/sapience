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
  Spinner,
  Text,
  useToast,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';

import Chart from '~/lib/components/chart';
import ChartSelector from '~/lib/components/ChartSelector';
import DepthChart from '~/lib/components/DepthChart';
import EpochHeader from '~/lib/components/foil/epochHeader';
import LiquidityPositionsTable from '~/lib/components/foil/liquidityPositionsTable';
import MarketSidebar from '~/lib/components/foil/marketSidebar';
import MarketUnitsToggle from '~/lib/components/foil/marketUnitsToggle';
import Stats from '~/lib/components/foil/stats';
import TraderPositionsTable from '~/lib/components/foil/traderPositionsTable';
import TransactionTable from '~/lib/components/foil/transactionTable';
import VolumeChart from '~/lib/components/VolumeChart';
import VolumeWindowSelector from '~/lib/components/VolumeWindowButtons';
import { API_BASE_URL } from '~/lib/constants/constants';
import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';
import { MarketProvider } from '~/lib/context/MarketProvider';
import { ChartType, TimeWindow } from '~/lib/interfaces/interfaces';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds

const useAccountData = () => {
  const { address, isConnected } = useAccount();

  return useQuery({
    queryKey: ['accountData', address],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/accounts/${address}`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    enabled: isConnected,
    refetchInterval: POLLING_INTERVAL,
  });
};

const Market = ({
  params,
  isTrade,
}: {
  params: { id: string; epoch: string };
  isTrade: boolean;
}) => {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>(
    TimeWindow.W
  );
  const [tableFlexHeight, setTableFlexHeight] = useState(172);
  const resizeRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<ChartType>(ChartType.PRICE);
  const [isRefetchingIndexPrices, setIsRefetchingIndexPrices] = useState(false);
  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;
  const contractId = `${chainId}:${marketAddress}`;
  const { isConnected } = useAccount();
  const toast = useToast();

  // useEffect to handle table resize
  useEffect(() => {
    const resizeElement = resizeRef.current;
    let startY: number;
    let startHeight: number;

    const onMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY;
      const newHeight = Math.max(50, startHeight + deltaY);
      setTableFlexHeight(newHeight);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    const onMouseDown = (e: MouseEvent) => {
      startY = e.clientY;
      startHeight = tableFlexHeight;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    if (resizeElement) {
      resizeElement.addEventListener('mousedown', onMouseDown);
    }

    return () => {
      if (resizeElement) {
        resizeElement.removeEventListener('mousedown', onMouseDown);
      }
    };
  }, [tableFlexHeight]);

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
    if (useVolumeError) {
      console.error('useVolumeError =', useVolumeError);
    }
  }, [volume, useVolumeError]);

  const useMarketPrices = () => {
    return useQuery({
      queryKey: ['market-prices', `${chainId}:${marketAddress}`],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/prices/chart-data?contractId=${chainId}:${marketAddress}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000,
    });
  };

  const useIndexPrices = () => {
    return useQuery({
      queryKey: ['index-prices', `${chainId}:${marketAddress}`],
      queryFn: async () => {
        const response = await fetch(
          `${API_BASE_URL}/prices/index?contractId=${chainId}:${marketAddress}&epochId=${epoch}&timeWindow=${selectedWindow}`
        );
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      },
      refetchInterval: 60000,
    });
  };

  const {
    data: marketPrices,
    error: usePricesError,
    isLoading: isLoadingPrices,
    refetch: refetchPrices,
    isRefetching: isRefetchingPrices,
  } = useMarketPrices();

  const {
    data: indexPrices,
    error: useIndexPricesError,
    isLoading: isLoadingIndexPrices,
    refetch: refetchIndexPrices,
  } = useIndexPrices();

  useEffect(() => {
    setIsRefetchingIndexPrices(true);
    refetchVolume();
    refetchPrices();
    refetchIndexPrices().then(() => {
      setIsRefetchingIndexPrices(false);
    });
  }, [selectedWindow]);

  const idxLoading = isLoadingIndexPrices || isRefetchingIndexPrices;

  const renderChart = () => {
    if (chartType === ChartType.PRICE) {
      return (
        <Chart
          activeWindow={selectedWindow}
          data={{
            marketPrices: marketPrices || [],
            indexPrices: indexPrices || [],
          }}
          isLoading={idxLoading}
        />
      );
    }
    if (chartType === ChartType.VOLUME) {
      return <VolumeChart data={volume || []} activeWindow={selectedWindow} />;
    }
    if (chartType === ChartType.LIQUIDITY) {
      return <DepthChart />;
    }
    return null;
  };

  const renderLoadng = () => {
    if (chartType === ChartType.PRICE && idxLoading) {
      return (
        <Flex
          ml={2}
          id="idx-loading"
          gap={2}
          justifyContent="center"
          alignItems="center"
        >
          <Spinner size="sm" />
          <Text fontSize="xs">Loading Index Prices...</Text>
        </Flex>
      );
    }
    return null;
  };

  const {
    data: accountData,
    error: accountDataError,
    isLoading: isLoadingAccountData,
  } = useAccountData();

  const traderPositions =
    accountData?.positions.filter((position: any) => !position.isLP) || [];
  const lpPositions =
    accountData?.positions.filter((position: any) => position.isLP) || [];
  const transactions = accountData?.transactions || [];

  useEffect(() => {
    if (accountDataError) {
      toast({
        title: 'Error loading account data',
        description: accountDataError.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [accountDataError, toast]);

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <AddEditPositionProvider>
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
                  {renderChart()}
                </Flex>
                <HStack
                  justifyContent="space-between"
                  width="100%"
                  justify="center"
                  mt={1}
                  mb={3}
                  flexShrink={0}
                >
                  <Flex dir="row">
                    <MarketUnitsToggle />
                    {chartType !== ChartType.LIQUIDITY && (
                      <Flex dir="row">
                        <VolumeWindowSelector
                          selectedWindow={selectedWindow}
                          setSelectedWindow={setSelectedWindow}
                        />
                        {renderLoadng()}
                      </Flex>
                    )}
                  </Flex>
                  <ChartSelector
                    chartType={chartType}
                    setChartType={setChartType}
                  />
                </HStack>
              </Flex>
              <Box
                width={{ base: '100%' }}
                maxWidth={{ base: 'none', md: '360px' }}
                pb={3}
              >
                <MarketSidebar isTrade={isTrade} />
              </Box>
            </Flex>
            {transactions.length > 0 && (
              <Flex
                id="table-flex"
                borderTop="1px solid"
                borderColor="gray.200"
                height={`${tableFlexHeight}px`}
                pt={1}
                position="relative"
                justifyContent="center"
                alignItems="center"
              >
                {isLoadingAccountData ? (
                  <Spinner size="lg" />
                ) : (
                  <Tabs
                    display="flex"
                    flexDirection="column"
                    width="100%"
                    height="100%"
                  >
                    <TabList>
                      <Tab>Transactions</Tab>
                      <Tab>Trader Positions</Tab>
                      <Tab>LP Positions</Tab>
                    </TabList>
                    <TabPanels flexGrow={1} overflowY="auto">
                      <TabPanel>
                        <TransactionTable transactions={transactions} />
                      </TabPanel>
                      <TabPanel>
                        <TraderPositionsTable positions={traderPositions} />
                      </TabPanel>
                      <TabPanel>
                        <LiquidityPositionsTable positions={lpPositions} />
                      </TabPanel>
                    </TabPanels>
                  </Tabs>
                )}
              </Flex>
            )}
          </Flex>
        </Flex>
      </AddEditPositionProvider>
    </MarketProvider>
  );
};

export default Market;
