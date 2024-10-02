'use client';

import { Box, Button } from '@chakra-ui/react';
import type React from 'react';
import { useContext, useMemo } from 'react';
import type { AbiFunction } from 'viem';

import { TICK_SPACING_DEFAULT } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';

interface Props {}
const DepthChart: React.FC<Props> = () => {
  const { pool, epochParams, chainId, foilData } = useContext(MarketContext);

  const tickSpacing = pool ? pool?.tickSpacing : TICK_SPACING_DEFAULT;
  const ticks = useMemo(() => {
    const tickRange: number[] = [];
    for (
      let i = epochParams.baseAssetMinPriceTick;
      i < epochParams.baseAssetMaxPriceTick + tickSpacing;
      i += tickSpacing
    ) {
      tickRange.push(i);
    }
    return tickRange;
  }, [epochParams, tickSpacing]);

  const contracts = useMemo(() => {
    return ticks.map((tick) => {
      return {
        abi: foilData.abi as AbiFunction[],
        address: foilData.address as `0x${string}`,
        functionName: 'ticks',
        args: [tick],
        chainId,
      };
    });
  }, [ticks]);

  return (
    <Box>
      <Button onClick={() => console.log(ticks)}> Test</Button>
    </Box>
  );
};

export default DepthChart;
