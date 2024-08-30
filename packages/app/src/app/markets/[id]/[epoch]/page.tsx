'use client';

import {
  Flex,
  Box,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
} from '@chakra-ui/react';

import Chart from '~/lib/components/chart';
import LiquidityPositionsTable from '~/lib/components/foil/liquidityPositionsTable';
import PositionsHeader from '~/lib/components/foil/positionsHeader';
import TraderPositionsTable from '~/lib/components/foil/traderPositionsTable';
import TransactionTable from '~/lib/components/foil/transactionTable';
import MarketSidebar from '~/lib/components/foil/marketSidebar';
import { MarketProvider } from '~/lib/context/MarketProvider';

const Market = ({ params }: { params: { id: string; epoch: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');
  const { epoch } = params;

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
          <TabList>
            <Tab>Transactions</Tab>
            <Tab>Trader Positions</Tab>
            <Tab>LP Positions</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <TransactionTable />
            </TabPanel>
            <TabPanel>
              <TraderPositionsTable />
            </TabPanel>
            <TabPanel>
              <LiquidityPositionsTable />
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Flex>
    </MarketProvider>
  );
};

export default Market;
