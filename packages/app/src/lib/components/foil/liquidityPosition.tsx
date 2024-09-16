'use client';

import { Box, Button, Divider, Heading, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { useAccount } from 'wagmi';

import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';

import AddEditLiquidity from './addEditLiquidity';
import PositionSelector from './positionSelector';

const LiquidityPosition = () => {
  const [nftId, setNftId] = useState(0);
  const { address } = useAccount();
  const { tokenIds, refetch } = useTokenIdsOfOwner(address as `0x${string}`);

  return (
    <Box>
      <Box>
        <PositionSelector
          isLP
          onChange={setNftId}
          nftIds={tokenIds}
          value={nftId}
        />
      </Box>
      <AddEditLiquidity nftId={nftId} refetchTokens={refetch} />
      <Box hidden={nftId === 0}>
        <Divider my={6} />
        <Heading size="sm" mb={1}>
          Collect Fees
        </Heading>
        <Text fontSize="sm" mb={2}>
          Liquidity providers earn fees from traders when the market price is
          within their low and high price.
        </Text>
        <Button size="sm" variant="brand" w="100%" mb={2}>
          Redeem 0 wstETH
        </Button>
        <Text fontSize="sm" mb={0.5} display="none">
          PnL: +0 wstETH (inclusive of fees)
        </Text>
        <Text fontSize="sm" display="none">
          APY: 0%
        </Text>
      </Box>
    </Box>
  );
};

export default LiquidityPosition;
