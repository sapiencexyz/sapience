'use client';

import { Box } from '@chakra-ui/react';

import AddEditLiquidity from './addEditLiquidity';
import PositionSelector from './positionSelector';

const LiquidityPosition = ({
  changeToTradeTab,
}: {
  changeToTradeTab: () => void;
}) => {
  return (
    <Box>
      <PositionSelector isLP />
      <AddEditLiquidity changeToTradeTab={changeToTradeTab} />
    </Box>
  );
};

export default LiquidityPosition;
