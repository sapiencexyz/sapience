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
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';

import Chart from '~/lib/components/chart';
import EpochHeader from '~/lib/components/foil/epochHeader';
import LiquidityPositionsTable from '~/lib/components/foil/liquidityPositionsTable';
import MarketSidebar from '~/lib/components/foil/marketSidebar';
import Stats from '~/lib/components/foil/stats';
import TraderPositionsTable from '~/lib/components/foil/traderPositionsTable';
import TransactionTable from '~/lib/components/foil/transactionTable';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketProvider } from '~/lib/context/MarketProvider';

const POLLING_INTERVAL = 10000; // Refetch every 10 seconds
const Market = ({ params }: { params: { id: string; epoch: string } }) => {
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
            <Flex direction="column" w="100%" h="100%">
              <Stats />
              <Box flex={1} overflow="hidden">
                <Chart />
              </Box>
            </Flex>
            <Box
              width={{ base: '100%' }}
              maxWidth={{ base: 'none', md: '400px' }}
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
