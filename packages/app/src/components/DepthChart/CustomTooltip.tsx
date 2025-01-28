import type { Pool } from '@uniswap/v3-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import type React from 'react';
import { useEffect, useContext } from 'react';
import type { TooltipProps } from 'recharts';

import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { BarChartTick } from '~/lib/util/liquidityUtil';
import { convertGgasPerWstEthToGwei } from '~/lib/util/util';

interface CustomTooltipProps {
  pool: Pool | null;
  onTickInfo: (tickIdx: number, price0: number, price1: number) => void;
  isTrade: boolean;
}

export const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, pool, onTickInfo, isTrade }) => {
  const { useMarketUnits, stEthPerToken } = useContext(PeriodContext);

  useEffect(() => {
    if (payload && payload[0]) {
      const tick: BarChartTick = payload[0].payload;
      onTickInfo(tick.tickIdx, tick.price0, tick.price1);
    }
  }, [payload, onTickInfo]);

  if (!payload || !payload[0] || !pool) return null;
  const tick: BarChartTick = payload[0].payload;

  const displayValue = (value: number) => {
    return useMarketUnits
      ? value
      : convertGgasPerWstEthToGwei(value, stEthPerToken);
  };

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
            <p>
              {displayValue(tick.liquidityLockedToken0).toFixed(4)}{' '}
              {useMarketUnits ? 'Ggas' : 'gwei'}
            </p>
            <p>
              {displayValue(tick.liquidityLockedToken1).toFixed(4)}{' '}
              {useMarketUnits ? 'wstETH' : 'gwei'}
            </p>
          </>
        )}
        {isTrade && !tick.isCurrent && tick.tickIdx < pool.tickCurrent && (
          <p>
            {displayValue(tick.liquidityActive).toFixed(4)}{' '}
            {useMarketUnits ? 'wstETH' : 'gwei'}
          </p>
        )}
        {isTrade && !tick.isCurrent && tick.tickIdx >= pool.tickCurrent && (
          <p>
            {displayValue(tick.liquidityActive).toFixed(4)}{' '}
            {useMarketUnits ? 'Ggas' : 'gwei'}
          </p>
        )}
        {!isTrade && (
          <>
            {tick.tickIdx < pool.tickCurrent && !tick.isCurrent && (
              <p>
                {displayValue(tick.liquidityLockedToken1).toFixed(4)}{' '}
                {useMarketUnits ? 'wstETH' : 'gwei'}
              </p>
            )}
            {tick.tickIdx > pool.tickCurrent && !tick.isCurrent && (
              <p>
                {displayValue(tick.liquidityLockedToken0).toFixed(4)}{' '}
                {useMarketUnits ? 'Ggas' : 'gwei'}
              </p>
            )}
            {tick.isCurrent && (
              <>
                <p>
                  {displayValue(tick.liquidityLockedToken1).toFixed(4)}{' '}
                  {useMarketUnits ? 'wstETH' : 'gwei'}
                </p>
                <p>
                  {displayValue(tick.liquidityLockedToken0).toFixed(4)}{' '}
                  {useMarketUnits ? 'Ggas' : 'gwei'}
                </p>
              </>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomTooltip;
