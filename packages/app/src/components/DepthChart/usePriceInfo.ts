import type { Pool } from '@uniswap/v3-sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { PoolData } from '~/lib/utils/liquidityUtil';

export function usePriceInfo(
  pool: Pool | null,
  poolData: PoolData | undefined
) {
  const [price0, setPrice0] = useState<number>(0);
  const [label, setLabel] = useState<string>('');

  const setTickInfo = useCallback((tickIdx: number, rawPrice0: number) => {
    setPrice0(rawPrice0);
    setLabel(`Tick ${tickIdx}`);
  }, []);

  const [currPrice0, currPrice1] = useMemo(() => {
    const currTick = poolData?.ticks.filter((t) => t.isCurrent);
    if (currTick) {
      return [currTick[0].price0, currTick[0].price1];
    }
    return [0, 0];
  }, [poolData]);

  const isActiveTick = useMemo(() => {
    if (!price0 || !currPrice0) return false;
    return Math.abs(price0 - currPrice0) < 0.000001;
  }, [price0, currPrice0]);

  const nextPrice = useMemo(() => {
    if (!price0 || !pool?.tickSpacing) return 0;
    return price0 * 1.0001 ** pool.tickSpacing;
  }, [price0, pool?.tickSpacing]);

  useEffect(() => {
    if (currPrice0 && currPrice1) {
      setPrice0(currPrice0);
      if (pool?.tickCurrent) {
        setTickInfo(pool.tickCurrent, currPrice0);
      }
    }
  }, [currPrice0, currPrice1, pool?.tickCurrent, setTickInfo]);

  return {
    price0,
    label,
    isActiveTick,
    nextPrice,
    setTickInfo,
  };
}

export default usePriceInfo;
