'use client';

import { Box } from '@chakra-ui/react';

import { AddEditPositionProvider } from '~/lib/context/AddEditPositionContext';

import AddEditLiquidity from './addEditLiquidity';
import PositionSelector from './positionSelector';

const LiquidityPosition = () => {
  return (
    <AddEditPositionProvider>
      <Box>
        <PositionSelector isLP />
        <AddEditLiquidity />
      </Box>
    </AddEditPositionProvider>
  );
};

export default LiquidityPosition;
