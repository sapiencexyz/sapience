'use client';

import { Box } from '@chakra-ui/react';

import AddEditTrade from './addEditTrade';
import PositionSelector from './positionSelector';

const TradePosition: React.FC<{ showTraderConversionAlert: boolean }> = ({
  showTraderConversionAlert,
}) => {
  return (
    <Box>
      <PositionSelector isLP={false} />
      <AddEditTrade />
    </Box>
  );
};

export default TradePosition;
