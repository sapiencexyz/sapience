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
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRefresh = async () => {
    await refetch();
    // update thhe refresh trigger so force the position selector to refresh data about each nft
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <Box>
      <Box>
        <PositionSelector
          isLP
          onChange={setNftId}
          nftIds={tokenIds}
          value={nftId}
          refreshTrigger={refreshTrigger}
        />
      </Box>
      <AddEditLiquidity nftId={nftId} handleTokenRefresh={handleRefresh} />
    </Box>
  );
};

export default LiquidityPosition;
