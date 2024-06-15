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
import Positions from '~/lib/components/foil/positions';
import PositionsHeader from '~/lib/components/foil/positionsHeader';
import TraderPosition from '~/lib/components/foil/traderPosition';
import { MarketProvider } from '~/lib/context/MarketProvider';

const Market = ({ params }: { params: { id: string } }) => {
  const [chainId, marketAddress] = params.id.split('%3A');

  return (
    <MarketProvider chainId={Number(chainId)} address={marketAddress}>
      <Flex direction="column" alignItems="left" mb={8} w="full" py={8}>
        <PositionsHeader />
        <Flex width="100%">
          <Box height="100%" width="66%">
            <Chart />
          </Box>
          <Box
            border="1px solid"
            borderColor="gray.200"
            borderRadius="md"
            p={4}
          >
            <Heading size="md" mb={4}>
              Trade
            </Heading>
            <TraderPosition />
          </Box>
        </Flex>
        <Tabs>
          <TabList>
            <Tab>Overview</Tab>
            <Tab>Positions</Tab>
            <Tab>Transactions</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>coming soon</TabPanel>
            <TabPanel>
              <Positions />
            </TabPanel>
            <TabPanel>coming soon</TabPanel>
          </TabPanels>
        </Tabs>
      </Flex>
    </MarketProvider>
  );
};

export default Market;
