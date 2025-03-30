import type { Pool } from '@uniswap/v3-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import type React from 'react';
import { useEffect, useContext } from 'react';
import type { TooltipProps } from 'recharts';

import { useFoil } from '../../lib/context/FoilProvider';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { BarChartTick } from '~/lib/utils/liquidityUtil';

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
  const { collateralAssetTicker, valueDisplay, unitDisplay } =
    useContext(PeriodContext);

  useEffect(() => {
    if (payload && payload[0]) {
      const tick: BarChartTick = payload[0].payload;
      onTickInfo(tick.tickIdx, tick.price0, tick.price1);
    }
  }, [payload, onTickInfo]);

  if (!payload || !payload[0] || !pool || isDragging) return null;
  const tick: BarChartTick = payload[0].payload;

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
              {valueDisplay(tick.liquidityLockedToken0, stEthPerToken).toFixed(
                4
              )}{' '}
              Virtual {unitDisplay(false)}
            </p>
            <p>
              {valueDisplay(tick.liquidityLockedToken1, stEthPerToken).toFixed(
                4
              )}{' '}
              {collateralAssetTicker}
            </p>
          </>
        )}

        {isTrade && !tick.isCurrent && (
          <p>
            {valueDisplay(tick.liquidityActive, stEthPerToken).toFixed(4)}{' '}
            {tick.tickIdx < pool.tickCurrent
              ? `Virtual ${collateralAssetTicker}`
              : `Virtual ${unitDisplay(false)}`}
          </p>
        )}

        {!isTrade &&
          (tick.isCurrent ? (
            <>
              <p>
                {valueDisplay(
                  tick.liquidityLockedToken1,
                  stEthPerToken
                ).toFixed(4)}{' '}
                Virtual {collateralAssetTicker}
              </p>
              <p>
                {valueDisplay(
                  tick.liquidityLockedToken0,
                  stEthPerToken
                ).toFixed(4)}{' '}
                Virtual {unitDisplay(false)}
              </p>
            </>
          ) : (
            <p>
              {tick.tickIdx < pool.tickCurrent
                ? `${valueDisplay(tick.liquidityLockedToken1, stEthPerToken).toFixed(4)} Virtual ${collateralAssetTicker}`
                : `${valueDisplay(tick.liquidityLockedToken0, stEthPerToken).toFixed(4)} Virtual ${unitDisplay(false)}`}
            </p>
          ))}
      </motion.div>
    </AnimatePresence>
  );
};

export default CustomTooltip;
