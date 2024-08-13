'use client';

import { Box, Button, Divider, Heading, Text } from '@chakra-ui/react';
import React, { useState } from 'react';

import AddLiquidity from './addLiquidity';
import EditLiquidity from './editLiquidity';
import PositionSelector from './positionSelector';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import { useAccount } from 'wagmi';

const LiquidityPosition = () => {
  const [nftId, setNftId] = useState(0);
  const { address } = useAccount();
  const { tokenIds, refetch } = useTokenIdsOfOwner(address as `0x${string}`);

  return (
    <Box>
      <Box>
        <PositionSelector isLP onChange={setNftId} nftIds={tokenIds} />
      </Box>
      <AddLiquidity nftId={nftId} refetch={refetch} />
      {/* {nftId === 0 ? <AddLiquidity /> : <EditLiquidity />} */}
      <Box hidden={nftId === 0}>
        <Divider my={6} />
        <Heading size="sm" mb={1}>
          Earn Fees
        </Heading>
        <Text fontSize="sm" mb={2} maxWidth="320px">
          Liquidity providers earn fees from traders when the market price is
          within their low and high price.
        </Text>
        <Button size="sm" variant="brand" w="100%" mb={2}>
          Redeem 0 wstETH
        </Button>
        <Text fontSize="sm" mb={0.5}>
          PnL: +0 wstETH (inclusive of fees)
        </Text>
        <Text fontSize="sm">APY: 0%</Text>
      </Box>
    </Box>
  );
};

export default LiquidityPosition;
