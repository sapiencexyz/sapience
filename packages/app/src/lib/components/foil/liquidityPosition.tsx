'use client';

import { Box } from '@chakra-ui/react';

import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';

import AddEditLiquidity from './addEditLiquidity';
import PositionSelector from './positionSelector';

const LiquidityPosition = ({
  handleTabChange,
}: {
  handleTabChange: (index: number, hasConvertedToTrader: boolean) => void;
}) => {
  return (
    <AddEditPositionProvider>
      <Box>
        <PositionSelector isLP />
        <AddEditLiquidity handleTabChange={handleTabChange} />
      </Box>
    </AddEditPositionProvider>
  );
};

export default LiquidityPosition;
