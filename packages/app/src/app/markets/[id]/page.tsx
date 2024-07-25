'use client';

import {
  Flex,
  Heading,
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
import { MarketProvider } from '~/lib/context/MarketProvider';

const Market = ({ params }: { params: { id: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <MarketProvider chainId={Number(chainId)} address={marketAddress}>
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
            p={6}
          >
            <Tabs isFitted>
              <TabList>
                <Tab>Trade</Tab>
                <Tab>Provide&nbsp;Liquidity</Tab>
              </TabList>
              <TabPanels>
                <TabPanel pt={6}>
                  <TraderPosition />
                </TabPanel>
                <TabPanel pt={6}>
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
              <Box py={6}>Coming soon.</Box>
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
