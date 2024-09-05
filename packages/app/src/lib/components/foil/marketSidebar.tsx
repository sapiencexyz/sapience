import { Box, Tab, TabList, TabPanel, TabPanels, Tabs } from '@chakra-ui/react';
import { useContext } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

import LiquidityPosition from './liquidityPosition';
import Settle from './settle';
import TraderPosition from './traderPosition';

export default function MarketSidebar() {
  const { endTime } = useContext(MarketContext);
  const expired = endTime < Math.floor(Date.now() / 1000);

  return (
    <Box border="1px solid" borderColor="gray.300" borderRadius="md" w="100%">
      {expired ? (
        <Settle />
      ) : (
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
      )}
    </Box>
  );
}
