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
import LiquidityPosition from '~/lib/components/foil/liquidityPosition';
import LiquidityPositionsTable from '~/lib/components/foil/liquidityPositionsTable';
import PositionsHeader from '~/lib/components/foil/positionsHeader';
import TraderPosition from '~/lib/components/foil/traderPosition';
import TraderPositionsTable from '~/lib/components/foil/traderPositionsTable';
import TransactionTable from '~/lib/components/foil/transactionTable';
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
          <Box
            border="1px solid"
            borderColor="gray.300"
            borderRadius="md"
            maxWidth="380px"
          >
            <Tabs isFitted>
              <TabList>
                <Tab pt={4}>Trade</Tab>
                <Tab pt={4}>Provide&nbsp;Liquidity</Tab>
              </TabList>
              <TabPanels>
                <TabPanel p={6}>
                  <TraderPosition />
                </TabPanel>
                <TabPanel p={6}>
                  <LiquidityPosition />
                </TabPanel>
              </TabPanels>
            </Tabs>
          </Box>
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
