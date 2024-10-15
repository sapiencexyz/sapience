'use client';

import { Box } from '@chakra-ui/react';

import AddEditLiquidity from './addEditLiquidity';
import PositionSelector from './positionSelector';

const LiquidityPosition = ({
  handleTabChange,
}: {
  handleTabChange: (index: number, hasConvertedToTrader: boolean) => void;
}) => {
  return (
    <Box>
      <PositionSelector isLP />
      <AddEditLiquidity handleTabChange={handleTabChange} />
    </Box>
  );
};

export default LiquidityPosition;
