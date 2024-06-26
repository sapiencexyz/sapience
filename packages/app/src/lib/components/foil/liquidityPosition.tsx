'use client';

import { Box } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

import PositionSelector from './positionSelector';
import AddLiquidity from './addLiquidity';
import EditLiquidity from './editLiquidity';

const LiquidityPosition = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  params,
}: {
  params: { mode: string; selectedData: JSON };
}) => {
  const [nftId, setNftId] = useState(0);

  return (
    <Box>
      <Box mb={3}>
        <PositionSelector isLP onChange={setNftId} />
      </Box>
      {nftId === 0 ? <AddLiquidity /> : <EditLiquidity nftId={nftId} />}
    </Box>
  );
};

export default LiquidityPosition;
