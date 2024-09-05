'use client';

import { RepeatIcon } from '@chakra-ui/icons';
import {
  Flex,
  Box,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Button,
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';

import Chart from '~/lib/components/chart';
import LiquidityPositionsTable from '~/lib/components/foil/liquidityPositionsTable';
import MarketSidebar from '~/lib/components/foil/marketSidebar';
import PositionsHeader from '~/lib/components/foil/positionsHeader';
import TraderPositionsTable from '~/lib/components/foil/traderPositionsTable';
import TransactionTable from '~/lib/components/foil/transactionTable';
import { API_BASE_URL } from '~/lib/constants/constants';
import { MarketProvider } from '~/lib/context/MarketProvider';

const POLLING_INTERVAL = 60000; // Refetch every 60 seconds
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
    refetch: refetchTradePositions,
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
    refetch: refetchLpPositions,
  } = useLiquidityPositions();

  const refetchData = () => {
    refetchTransactions();
    refetchTradePositions();
    refetchLpPositions();
  };

  return (
    <MarketProvider
      chainId={Number(chainId)}
      address={marketAddress}
      epoch={Number(epoch)}
    >
      <Flex direction="column" alignItems="left" mb={8} w="full" py={8}>
        <PositionsHeader />
        <Flex width="100%" gap={12} mb={12}>
          <Box height="100%" flex="2">
            <Chart />
          </Box>
          <MarketSidebar />
        </Flex>
        <Tabs>
          <Flex justify="space-between" align="center">
            <TabList>
              <Tab>Transactions</Tab>
              <Tab>Trader Positions</Tab>
              <Tab>LP Positions</Tab>
            </TabList>
            <Button size="sm" onClick={refetchData} rightIcon={<RepeatIcon />}>
              Refresh
            </Button>
          </Flex>
          <TabPanels pt={4}>
            <TabPanel>
              <TransactionTable
                isLoading={isLoadingTransactions}
                error={useTransactionsError}
                transactions={transactions}
              />
            </TabPanel>
            <TabPanel>
              <TraderPositionsTable
                isLoading={isLoadingTradePositions}
                error={tradePositionsError}
                positions={tradePositions}
              />
            </TabPanel>
            <TabPanel>
              <LiquidityPositionsTable
                isLoading={isLoadingLpPositions}
                error={lpPositionsError}
                positions={lpPositions}
              />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Flex>
    </MarketProvider>
  );
};

export default Market;
