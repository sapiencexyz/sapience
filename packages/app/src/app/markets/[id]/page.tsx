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
            <Heading size="md" mb={3}>
              Trade
            </Heading>
            <TraderPosition />
          </Box>
        </Flex>
        <Tabs>
          <TabList>
            <Tab>Positions</Tab>
            <Tab>Transactions</Tab>
          </TabList>
          <TabPanels>
            <TabPanel>
              <Positions />
            </TabPanel>
            <TabPanel><Box py={6}>Coming soon.</Box></TabPanel>
          </TabPanels>
        </Tabs>
      </Flex>
    </MarketProvider>
  );
};

export default Market;
