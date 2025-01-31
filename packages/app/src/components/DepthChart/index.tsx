'use client';

import { motion } from 'framer-motion';
import { MoveHorizontal } from 'lucide-react';
import type React from 'react';
import { useContext, useRef, useState } from 'react';
import {
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from 'recharts';

import NumberDisplay from '~/components/numberDisplay';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useTradePool } from '~/lib/context/TradePoolContext';
import { convertGgasPerWstEthToGwei } from '~/lib/util/util';

import { CustomBar } from './CustomBar';
import { CustomTooltip } from './CustomTooltip';
import { CustomXAxisTick } from './CustomXAxisTick';
import { DraggableHandle } from './DraggableHandle';
import { usePoolData } from './usePoolData';
import { usePriceInfo } from './usePriceInfo';
import { CHART_LEFT_MARGIN, usePriceRange } from './usePriceRange';

interface DepthChartProps {
  isTrade?: boolean;
}

interface XAxisTickProps {
  x: number;
  y: number;
  width: number;
  height: number;
  tick: number;
  index: number;
  payload: { value: number };
}

const DepthChart: React.FC<DepthChartProps> = ({ isTrade = false }) => {
  const { nftId } = useAddEditPosition();
  const {
    pool,
    chainId,
    poolAddress,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    useMarketUnits,
    stEthPerToken,
  } = useContext(PeriodContext);

  const { setLowPriceTick, setHighPriceTick, lowPriceTick, highPriceTick } =
    useTradePool();

  const chartRef = useRef<HTMLDivElement>(null);
  const [chartReady, setChartReady] = useState(false);

  const poolData = usePoolData(
    pool,
    chainId,
    poolAddress,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    pool?.tickSpacing,
    isTrade
  );

  const { price0, label, isActiveTick, nextPrice, setTickInfo } = usePriceInfo(
    pool,
    poolData
  );

  const {
    lowPriceX,
    highPriceX,
    isDragging,
    handleLowPriceDrag,
    handleHighPriceDrag,
    handleLowPriceDragEnd,
    handleHighPriceDragEnd,
  } = usePriceRange(poolData, chartReady);

  // Initialize ticks and place draggable handles
  const handleResize = () => {
    setChartReady(true);
    setLowPriceTick(lowPriceTick || baseAssetMinPriceTick);
    setHighPriceTick(highPriceTick || baseAssetMaxPriceTick);
  };

  const renderBar = (props: any) => (
    <CustomBar
      props={props}
      activeTickValue={pool?.tickCurrent || 0}
      tickSpacing={pool?.tickSpacing || 0}
      isTrade={isTrade}
    />
  );

  const renderXAxis = (props: XAxisTickProps) => (
    <CustomXAxisTick
      props={props}
      activeTickValue={pool?.tickCurrent || 0}
      tickSpacing={pool?.tickSpacing || 0}
    />
  );

  return (
    <div className="flex flex-1 flex-col p-6" ref={chartRef}>
      {!poolData && (
        <div className="flex items-center justify-center h-full w-full">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent opacity-20" />
        </div>
      )}
      <motion.div
        className="w-fit pl-2 mb-6"
        initial={false}
        animate={{
          borderLeftWidth: '4px',
          borderLeftColor: isActiveTick ? '#8D895E' : '#F1EBDD',
        }}
        transition={{ duration: 0.2 }}
      >
        <div className="flex flex-col gap-0.5">
          <p className="text-xs font-medium text-gray-500">
            {label ? `${label}` : ''}
            {isActiveTick && <> (Active)</>}
          </p>
        </div>
        {pool && price0 && (
          <div className="flex items-center">
            <NumberDisplay
              value={
                useMarketUnits
                  ? price0
                  : convertGgasPerWstEthToGwei(price0, stEthPerToken)
              }
              precision={4}
            />
            <span className="ml-1">
              {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
            </span>
            <MoveHorizontal className="w-3 h-3 mx-1" />
            <NumberDisplay
              value={
                useMarketUnits
                  ? nextPrice
                  : convertGgasPerWstEthToGwei(nextPrice, stEthPerToken)
              }
              precision={4}
            />
            <span className="ml-1">
              {useMarketUnits ? 'wstETH/Ggas' : 'gwei'}
            </span>
          </div>
        )}
      </motion.div>
      {poolData && (
        <ResponsiveContainer width="100%" height="100%" onResize={handleResize}>
          <BarChart
            data={
              poolData.ticks.slice(
                0,
                -1
              ) /* Don't render last tick because it's unusable */
            }
            margin={
              isTrade ? { bottom: -25 } : { bottom: -25, left: 16, right: 16 }
            }
            onMouseLeave={() => {
              const currentTick = poolData?.ticks.find((t) => t.isCurrent);
              if (currentTick) {
                setTickInfo(pool?.tickCurrent || 0, currentTick.price0);
              }
            }}
          >
            <XAxis
              dataKey="tickIdx"
              tick={renderXAxis}
              height={60}
              interval={0}
              tickLine={false}
            />
            <YAxis hide domain={[0, 'auto']} />
            <Tooltip
              cursor={{ fill: '#F1EBDD' }}
              content={
                <CustomTooltip
                  pool={pool}
                  onTickInfo={setTickInfo}
                  isTrade={isTrade}
                  isDragging={isDragging}
                />
              }
            />
            <Bar
              dataKey={isTrade ? 'displayLiquidity' : 'liquidityActive'}
              shape={renderBar}
            />
            {!isTrade && (
              <g>
                {/* Left overlay rectangle */}
                <rect
                  x={16}
                  y={0}
                  width={(lowPriceX || 0) - CHART_LEFT_MARGIN}
                  height="calc(100% - 35px)"
                  className="fill-background"
                  opacity={0.75}
                />
                {/* Right overlay rectangle */}
                <rect
                  x={highPriceX || 0}
                  y={0}
                  width="100%"
                  height="calc(100% - 35px)"
                  className="fill-background"
                  opacity={0.75}
                />
                {chartRef.current && (
                  <>
                    {lowPriceX !== null && (
                      <DraggableHandle
                        x={lowPriceX}
                        y={0}
                        onDrag={(x) => handleLowPriceDrag(x, chartRef)}
                        onDragEnd={() => handleLowPriceDragEnd(chartRef)}
                        isHighPrice={false}
                        chartRef={chartRef}
                        disableDrag={!!nftId}
                      />
                    )}
                    {highPriceX !== null && (
                      <DraggableHandle
                        x={highPriceX}
                        y={0}
                        onDrag={(x) => handleHighPriceDrag(x, chartRef)}
                        onDragEnd={() => handleHighPriceDragEnd(chartRef)}
                        isHighPrice
                        chartRef={chartRef}
                        disableDrag={!!nftId}
                      />
                    )}
                  </>
                )}
              </g>
            )}
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default DepthChart;
