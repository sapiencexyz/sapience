'use client';

import { Box } from '@chakra-ui/react';
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
    </Box>
  );
};

export default LiquidityPosition;
