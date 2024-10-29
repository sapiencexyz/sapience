import { Box, Spinner, Center } from '@chakra-ui/react';
import { useSearchParams } from 'next/navigation';
import { useContext, useEffect } from 'react';

import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';

import LiquidityPosition from './liquidityPosition';
import Settle from './settle';
import TraderPosition from './traderPosition';

export default function MarketSidebar({ isTrade }: { isTrade: boolean }) {
  const { endTime } = useContext(MarketContext);
  const expired = endTime < Math.floor(Date.now() / 1000);
  const { setNftId } = useAddEditPosition();
  const searchParams = useSearchParams();

  useEffect(() => {
    const positionId = searchParams.get('positionId');
    if (positionId) {
      setNftId(Number(positionId));
    }
  }, [searchParams, setNftId]);

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

  const renderContent = () => {
    if (expired) {
      return <Settle />;
    }
    if (isTrade) {
      return <TraderPosition />;
    }
    return <LiquidityPosition />;
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
      p={6}
      overflowY="auto"
    >
      {renderContent()}
    </Box>
  );
}
