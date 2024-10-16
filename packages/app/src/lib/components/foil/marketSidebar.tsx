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
import { useContext, useEffect, useRef, useState } from 'react';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';

import LiquidityPosition from './liquidityPosition';
import Settle from './settle';
import TraderPosition from './traderPosition';

export default function MarketSidebar() {
  const [tabIndex, setTabIndex] = useState(0);
  const { endTime } = useContext(MarketContext);
  const { setNftId, positions } = useAddEditPosition();
  const expired = endTime < Math.floor(Date.now() / 1000);
  const isInitialMount = useRef(true);

  // Refined useEffect to set nftId when positions are initialized
  useEffect(() => {
    const currentPositions =
      tabIndex === 1 ? positions.liquidityPositions : positions.tradePositions;

    if (isInitialMount.current && currentPositions.length > 0) {
      const lastPosition = currentPositions[currentPositions.length - 1];
      const lastPositionId = lastPosition?.id ? Number(lastPosition.id) : 0;
      setNftId(lastPositionId);
      isInitialMount.current = false;
    }
  }, [positions, tabIndex, setNftId]);

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

  const changeToTradeTab = () => {
    setTabIndex(0);
  };

  const handleTabChange = (index: number) => {
    // update nftdId to latest for that position type
    const filteredNfts =
      index === 1 ? positions.liquidityPositions : positions.tradePositions;
    const lastPosition = filteredNfts[filteredNfts.length - 1];
    const lastPositionId = lastPosition?.id ? Number(lastPosition.id) : 0;
    setNftId(lastPositionId);
    setTabIndex(index);
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
          isLazy
          onChange={(index) => handleTabChange(index)}
        >
          <TabList>
            <Tab pt={4}>Trade</Tab>
            <Tab pt={4}>Provide&nbsp;Liquidity</Tab>
          </TabList>
          <TabPanels flex={1} overflow="auto">
            <TabPanel p={6}>
              <TraderPosition />
            </TabPanel>
            <TabPanel p={6}>
              <LiquidityPosition changeToTradeTab={changeToTradeTab} />
            </TabPanel>
          </TabPanels>
        </Tabs>
      )}
    </Box>
  );
}
