import {
  Box,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Spinner,
  Center,
} from '@chakra-ui/react';
import { useContext, useState } from 'react';

import { MarketContext } from '~/lib/context/MarketProvider';

import LiquidityPosition from './liquidityPosition';
import Settle from './settle';
import TraderPosition from './traderPosition';

export default function MarketSidebar() {
  const [tabIndex, setTabIndex] = useState(0);
  const { endTime } = useContext(MarketContext);
  const expired = endTime < Math.floor(Date.now() / 1000);

  if (endTime === 0) {
    return (
      <Box
        height="100%"
        border="1px solid"
        borderColor="gray.300"
        borderRadius="md"
        w="100%"
        flex={1}
        display="flex"
        flexDirection="column"
      >
        <Center height="100%">
          <Spinner size="xl" opacity={0.5} />
        </Center>
      </Box>
    );
  }

  const handleTabChange = (index: number, hasConvertedToTrader: boolean) => {
    console.log('hasConvertedToTrader', hasConvertedToTrader);
    if (hasConvertedToTrader) {
      setTabIndex(index);
    }
  };

  return (
    <Box
      height="100%"
      border="1px solid"
      borderColor="gray.300"
      borderRadius="md"
      w="100%"
      flex={1}
      display="flex"
      flexDirection="column"
    >
      {expired ? (
        <Settle />
      ) : (
        <Tabs
          isFitted
          display="flex"
          flexDirection="column"
          height="100%"
          index={tabIndex}
          onChange={(index) => setTabIndex(index)}
        >
          <TabList>
            <Tab pt={4}>Trade</Tab>
            <Tab pt={4}>Provide&nbsp;Liquidity</Tab>
          </TabList>
          <TabPanels flex={1} overflow="auto">
            <TabPanel p={6}>
              <TraderPosition showTraderConversionAlert />
            </TabPanel>
            <TabPanel p={6}>
              <LiquidityPosition handleTabChange={handleTabChange} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </Box>
  );
}
