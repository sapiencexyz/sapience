'use client';

import { Box, Button, Divider, Heading, Text } from '@chakra-ui/react';
import React, { useState } from 'react';

import AddLiquidity from './addLiquidity';
import EditLiquidity from './editLiquidity';
import PositionSelector from './positionSelector';

const LiquidityPosition = () => {
  const [nftId, setNftId] = useState(0);

  return (
    <Box>
      <Box>
        <PositionSelector isLP onChange={setNftId} />
      </Box>
      {nftId === 0 ? <AddLiquidity /> : <EditLiquidity />}
      <Divider my={6} />
      <Heading size="sm" mb={1}>
        Earn Fees
      </Heading>
      <Text fontSize="sm" mb={2} maxWidth="320px">
        Liquidity providers earn fees from traders when the market price is
        within their low and high price.
      </Text>
      <Button size="sm" variant="brand" w="100%" mb={2}>
        Redeem 0.0023wstETH
      </Button>
      <Text fontSize="sm" mb={0.5}>
        PnL: +32wstETH (inclusive of fees)
      </Text>
      <Text fontSize="sm">APY: 3%</Text>
    </Box>
  );
};

export default LiquidityPosition;
