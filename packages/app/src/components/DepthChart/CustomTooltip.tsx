import type { Pool } from '@uniswap/v3-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import type React from 'react';
import { useEffect, useContext } from 'react';
import type { TooltipProps } from 'recharts';

import { useFoil } from '../../lib/context/FoilProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { BarChartTick } from '~/lib/utils/liquidityUtil';
import { convertGgasPerWstEthToGwei } from '~/lib/utils/util';

interface CustomTooltipProps {
  pool: Pool | null;
  onTickInfo: (tickIdx: number, price0: number, price1: number) => void;
  isTrade: boolean;
  isDragging?: boolean;
}

export const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, pool, onTickInfo, isTrade, isDragging }) => {
  const { stEthPerToken } = useFoil();
  const { useMarketUnits } = useContext(PeriodContext);

  useEffect(() => {
    if (payload && payload[0]) {
      const tick: BarChartTick = payload[0].payload;
      onTickInfo(tick.tickIdx, tick.price0, tick.price1);
    }
  }, [payload, onTickInfo]);

  if (!payload || !payload[0] || !pool || isDragging) return null;
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
        <p className="text-xs font-medium text-gray-500 mb-0.5">
          {(() => {
            if (isTrade && tick.isCurrent) return 'Active Tick Liquidity';
            if (isTrade) return 'Cumulative Liquidity';
            return 'Liquidity';
          })()}
        </p>

        {isTrade && tick.isCurrent && (
          <>
            <p>
              {displayValue(tick.liquidityLockedToken0).toFixed(4)} Virtual Ggas
            </p>
            <p>
              {displayValue(tick.liquidityLockedToken1).toFixed(4)} Virtual
              wstETH
            </p>
          </>
        )}

        {isTrade && !tick.isCurrent && (
          <p>
            {displayValue(tick.liquidityActive).toFixed(4)}{' '}
            {tick.tickIdx < pool.tickCurrent
              ? 'Virtual wstETH'
              : 'Virtual Ggas'}
          </p>
        )}

        {!isTrade &&
          (tick.isCurrent ? (
            <>
              <p>
                {displayValue(tick.liquidityLockedToken1).toFixed(4)} Virtual
                wstETH
              </p>
              <p>
                {displayValue(tick.liquidityLockedToken0).toFixed(4)} Virtual
                Ggas
              </p>
            </>
          ) : (
            <p>
              {tick.tickIdx < pool.tickCurrent
                ? `${displayValue(tick.liquidityLockedToken1).toFixed(4)} Virtual wstETH`
                : `${displayValue(tick.liquidityLockedToken0).toFixed(4)} Virtual Ggas`}
            </p>
          ))}
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomTooltip;
