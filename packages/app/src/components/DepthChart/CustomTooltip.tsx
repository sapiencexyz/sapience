import type { Pool } from '@uniswap/v3-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import type React from 'react';
import { useEffect } from 'react';
import type { TooltipProps } from 'recharts';

import type { BarChartTick } from '~/lib/util/liquidityUtil';

interface CustomTooltipProps {
  pool: Pool | null;
  onTickInfo: (tickIdx: number, price0: number, price1: number) => void;
  isTrade: boolean;
}

export const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, pool, onTickInfo, isTrade }) => {
  useEffect(() => {
    if (payload && payload[0]) {
      const tick: BarChartTick = payload[0].payload;
      onTickInfo(tick.tickIdx, tick.price0, tick.price1);
    }
  }, [payload, onTickInfo]);

  if (!payload || !payload[0] || !pool) return null;
  const tick: BarChartTick = payload[0].payload;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="bg-background p-3 border border-border rounded-sm shadow-sm"
      >
        {(!isTrade || !tick.isCurrent) && (
          <p className="text-xs font-medium text-gray-500 mb-0.5">
            {isTrade ? 'Cumulative Liquidity' : 'Liquidity'}
          </p>
        )}
        {isTrade && tick.isCurrent && (
          <>
            <p className="text-xs font-medium text-gray-500 mb-0.5">
              Active Tick Liquidity
            </p>
            <p>{tick.liquidityLockedToken0.toFixed(4)} Ggas</p>
            <p>{tick.liquidityLockedToken1.toFixed(4)} wstETH</p>
          </>
        )}
        {isTrade && !tick.isCurrent && tick.tickIdx < pool.tickCurrent && (
          <p>{tick.liquidityActive.toFixed(4)} wstETH</p>
        )}
        {isTrade && !tick.isCurrent && tick.tickIdx >= pool.tickCurrent && (
          <p>{tick.liquidityActive.toFixed(4)} Ggas</p>
        )}
        {!isTrade && (
          <>
            {tick.tickIdx < pool.tickCurrent && !tick.isCurrent && (
              <p>{tick.liquidityLockedToken1.toFixed(4)} wstETH</p>
            )}
            {tick.tickIdx > pool.tickCurrent && !tick.isCurrent && (
              <p>{tick.liquidityLockedToken0.toFixed(4)} Ggas</p>
            )}
            {tick.isCurrent && (
              <>
                <p>{tick.liquidityLockedToken1.toFixed(4)} wstETH</p>
                <p>{tick.liquidityLockedToken0.toFixed(4)} Ggas</p>
              </>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomTooltip;
