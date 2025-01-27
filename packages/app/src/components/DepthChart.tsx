/* eslint-disable sonarjs/cognitive-complexity */

'use client';

import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { Pool } from '@uniswap/v3-sdk';
import { motion, AnimatePresence } from 'framer-motion';
import { MoveHorizontal } from 'lucide-react';
import type React from 'react';
import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from 'react';
import type { TooltipProps } from 'recharts';
import {
  BarChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from 'recharts';
import { type AbiFunction } from 'viem';
import { useReadContracts } from 'wagmi';

import NumberDisplay from '~/components/numberDisplay';
import { TICK_SPACING_DEFAULT } from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useTradePool } from '~/lib/context/TradePoolContext';
import type {
  BarChartTick,
  GraphTick,
  PoolData,
} from '~/lib/util/liquidityUtil';
import { getFullPool } from '~/lib/util/liquidityUtil';
import { convertGgasPerWstEthToGwei } from '~/lib/util/util';

const checkIsClosestTick = (
  tick: number,
  activeTickValue: number,
  tickSpacing: number
) => {
  return tick <= activeTickValue && tick + tickSpacing >= activeTickValue;
};

type TickDataTuple = [
  bigint, // liquidityGross
  bigint, // liquidityNet
  bigint, // feeGrowthOutside0X128
  bigint, // feeGrowthOutside1X128
  bigint, // tickCumulativeOutside
  bigint, // secondsPerLiquidityOutsideX128
  number, // secondsOutside
  boolean, // initialized
];

interface TickData {
  status: string;
  result: TickDataTuple;
}

interface CustomBarProps {
  props: {
    x: number;
    y: number;
    width: number;
    height: number;
    tickIdx: number;
    index: number;
  };
  activeTickValue: number;
  tickSpacing: number;
}

const RECHARTS_WRAPPER_SELECTOR = '.recharts-wrapper';

const CustomBar: React.FC<CustomBarProps> = ({
  props,
  activeTickValue,
  tickSpacing,
}) => {
  const { x, y, width, height, tickIdx } = props;

  const isClosestTick = checkIsClosestTick(
    tickIdx,
    activeTickValue,
    tickSpacing
  );

  let fill = '#58585A';
  if (isClosestTick) {
    fill = '#8D895E';
  } else if (tickIdx < activeTickValue) {
    fill = '#58585A';
  }
  return (
    <path
      d={`
          M ${x},${y + height}
          L ${x},${y + 2}
          Q ${x},${y} ${x + 2},${y}
          L ${x + width - 2},${y}
          Q ${x + width},${y} ${x + width},${y + 2}
          L ${x + width},${y + height}
          Z
        `}
      fill={fill}
      height="100%"
    />
  );
};

interface CustomXAxisTickProps {
  props: {
    x: number;
    y: number;
    width: number;
    height: number;
    tick: number;
    index: number;
    payload: any;
  };
  activeTickValue: number;
  tickSpacing: number;
}

const CustomXAxisTick: React.FC<CustomXAxisTickProps> = ({
  props,
  activeTickValue,
  tickSpacing,
}) => {
  const { payload, x, y } = props;

  const isClosestTick = checkIsClosestTick(
    payload.value,
    activeTickValue,
    tickSpacing
  );

  if (!isClosestTick) return null;

  return (
    <g transform={`translate(${x},${y})`} id="activeTicks">
      <text x={0} y={0} dy={12} textAnchor="middle" fontSize={12} opacity={0.5}>
        Active tick range
      </text>
    </g>
  );
};

interface CustomTooltipProps {
  pool: Pool | null;
  onTickInfo: (tickIdx: number, price0: number, price1: number) => void;
  useMarketUnits: boolean;
  isTrade: boolean;
}

const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, pool, onTickInfo, useMarketUnits, isTrade }) => {
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
        <p className="text-xs font-medium text-gray-500 mb-0.5">
          {isTrade ? 'Cumulative Liquidity' : 'Liquidity'}
        </p>
        {isTrade && tick.tickIdx < pool.tickCurrent && (
          <p>
            {tick.liquidityActive.toFixed(4)}{' '}
            {useMarketUnits ? 'wstETH' : 'gwei'}
          </p>
        )}
        {isTrade && tick.tickIdx >= pool.tickCurrent && (
          <p>
            {tick.liquidityActive.toFixed(4)} {useMarketUnits ? 'Ggas' : 'gas'}
          </p>
        )}
        {!isTrade && (
          <>
            {tick.tickIdx < pool.tickCurrent && !tick.isCurrent && (
              <p>
                {tick.liquidityLockedToken1.toFixed(4)}{' '}
                {useMarketUnits ? 'wstETH' : 'gwei'}
              </p>
            )}
            {tick.tickIdx > pool.tickCurrent && !tick.isCurrent && (
              <p>
                {tick.liquidityLockedToken0.toFixed(4)}{' '}
                {useMarketUnits ? 'Ggas' : 'gas'}
              </p>
            )}
            {tick.isCurrent && (
              <>
                <p>
                  {tick.liquidityLockedToken1.toFixed(4)}{' '}
                  {useMarketUnits ? 'Ggas' : 'gas'}
                </p>
                <p>
                  {tick.liquidityLockedToken0.toFixed(4)}{' '}
                  {useMarketUnits ? 'wstETH' : 'gwei'}
                </p>
              </>
            )}
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

interface DraggableHandleProps {
  x: number;
  y: number;
  onDrag: (x: number) => void;
  onDragEnd: () => void;
  color?: string;
  isHighPrice?: boolean;
  chartRef: React.RefObject<HTMLDivElement>;
}

function DraggableHandle({
  x,
  y,
  onDrag,
  onDragEnd,
  color = '#8D895E',
  isHighPrice = false,
  chartRef,
}: DraggableHandleProps) {
  // Offset the handle by 7 pixels left or right based on type
  const handleOffset = isHighPrice ? 7 : -7;

  // When PointerDown is fired, we capture the pointer so we can
  // reliably read pointer coordinates on subsequent moves.
  const handlePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // On pointer move, calculate the "relativeX" based on chart bounds
  // and pass it to your parent. The parent sets the new x in its state,
  // then rerenders DraggableHandle with the new x prop.
  const handlePointerMove = (e: React.PointerEvent<SVGGElement>) => {
    // Only move when the left mouse button is pressed
    if (e.buttons !== 1) return;
    if (!chartRef.current) return;

    const chartElement = chartRef.current.querySelector(
      RECHARTS_WRAPPER_SELECTOR
    ) as HTMLElement;
    if (!chartElement) return;

    const chartRect = chartElement.getBoundingClientRect();
    const relativeX = e.clientX - chartRect.left;

    onDrag(relativeX);
  };

  // On pointer up, we release the pointer capture and call onDragEnd
  const handlePointerUp = (e: React.PointerEvent<SVGGElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    onDragEnd();
  };

  return (
    // Use a plain <g> (no drag="x") so that we aren't mixing
    // motion's transforms with your own pointer logic.
    <g
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: 'ew-resize' }}
    >
      {/* Vertical bar */}
      <rect x={x} y={y} width={2} height="calc(100% - 35px)" fill={color} />

      {/* Handle icon at top */}
      <rect
        x={x - 6 + handleOffset}
        y={y}
        width={14}
        height={16}
        fill={color}
        rx={2}
      />

      {/* Little vertical lines inside the handle */}
      <line
        x1={x - 2 + handleOffset}
        y1={y + 4}
        x2={x - 2 + handleOffset}
        y2={y + 12}
        stroke="white"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={x + 1 + handleOffset}
        y1={y + 4}
        x2={x + 1 + handleOffset}
        y2={y + 12}
        stroke="white"
        strokeWidth={1}
        opacity={0.5}
      />
      <line
        x1={x + 4 + handleOffset}
        y1={y + 4}
        x2={x + 4 + handleOffset}
        y2={y + 12}
        stroke="white"
        strokeWidth={1}
        opacity={0.5}
      />
    </g>
  );
}

const DepthChart: React.FC<{ isTrade?: boolean }> = ({ isTrade = false }) => {
  const [poolData, setPool] = useState<PoolData | undefined>();
  const [price0, setPrice0] = useState<number>(0);
  const [label, setLabel] = useState<string>('');
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
  const { setLowPriceTick, setHighPriceTick } = useTradePool();
  const [lowPriceX, setLowPriceX] = useState<number | null>(null);
  const [highPriceX, setHighPriceX] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const setTickInfo = useCallback((tickIdx: number, rawPrice0: number) => {
    setPrice0(rawPrice0);
    setLabel(`Tick ${tickIdx}`);
  }, []);

  const activeTickValue = pool?.tickCurrent || 0;
  const tickSpacing = pool ? pool?.tickSpacing : TICK_SPACING_DEFAULT;

  const nextPrice = useMemo(() => {
    if (!price0 || !tickSpacing) return 0;
    return price0 * 1.0001 ** tickSpacing;
  }, [price0, tickSpacing]);

  const ticks = useMemo(() => {
    const tickRange: number[] = [];
    for (
      let i = baseAssetMinPriceTick;
      i < baseAssetMaxPriceTick;
      i += tickSpacing
    ) {
      tickRange.push(i);
    }
    return tickRange;
  }, [tickSpacing, baseAssetMaxPriceTick, baseAssetMinPriceTick]);

  const contracts = useMemo(() => {
    if (poolAddress === '0x' || !chainId) return [];
    return ticks.map((tick) => {
      return {
        abi: IUniswapV3PoolABI.abi as AbiFunction[],
        address: poolAddress as `0x${string}`,
        functionName: 'ticks',
        args: [tick],
        chainId,
      };
    });
  }, [ticks, poolAddress, chainId]);

  const { data: tickData } = useReadContracts({
    contracts,
  }) as { data: TickData[]; isLoading: boolean };

  const graphTicks: GraphTick[] = useMemo(() => {
    if (!tickData) return [];
    return tickData.map((tick, idx) => {
      return {
        tickIdx: ticks[idx].toString(),
        liquidityGross: tick.result[0].toString(),
        liquidityNet: tick.result[1].toString(),
      };
    });
  }, [tickData, ticks]);

  useEffect(() => {
    if (pool) {
      getFullPool(pool, graphTicks, tickSpacing).then((fullPoolData) => {
        if (isTrade) {
          const allTicks = fullPoolData.ticks;
          const currentTickIndex = allTicks.findIndex((tick) => tick.isCurrent);

          // Calculate right side (increasing from current tick)
          let runningSumRight = 0;
          const rightSide = allTicks.slice(currentTickIndex).map((tick) => {
            runningSumRight += tick.liquidityLockedToken1; // Ggas
            return { ...tick, liquidityActive: runningSumRight };
          });

          // Calculate left side (decreasing from current tick)
          let runningSumLeft = 0;
          const leftSide = allTicks
            .slice(0, currentTickIndex)
            .map((tick) => {
              runningSumLeft += tick.liquidityLockedToken0; // wstETH
              return { ...tick, liquidityActive: runningSumLeft };
            })
            .reverse();

          // Combine both sides
          const accumulatedTicks = [...leftSide, ...rightSide];
          setPool({ ...fullPoolData, ticks: accumulatedTicks });
        } else {
          setPool(fullPoolData);
        }
      });
    }
  }, [pool, graphTicks, tickSpacing, isTrade]);

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

  useEffect(() => {
    if (currPrice0 && currPrice1) {
      setPrice0(currPrice0);
      if (activeTickValue) {
        setTickInfo(activeTickValue, currPrice0);
      }
    }
  }, [currPrice0, currPrice1, activeTickValue, setTickInfo]);

  // Initialize handle positions from context
  useEffect(() => {
    if (!poolData || !chartRef.current) return;

    const chartWidth =
      chartRef.current.querySelector(RECHARTS_WRAPPER_SELECTOR)?.clientWidth ||
      0;
    if (chartWidth === 0) return;

    const xScale = chartWidth / poolData.ticks.length;
    const currentPrice = Number(pool?.token0Price || 0);
    const lowTickIndex = poolData.ticks.findIndex(
      (tick) => tick.price0 >= currentPrice * 0.8
    );
    const highTickIndex = poolData.ticks.findIndex(
      (tick) => tick.price0 >= currentPrice * 1.2
    );

    if (lowTickIndex !== -1) {
      setLowPriceX(lowTickIndex * xScale);
      setLowPriceTick(poolData.ticks[lowTickIndex].tickIdx);
    }

    if (highTickIndex !== -1) {
      setHighPriceX(highTickIndex * xScale);
      setHighPriceTick(poolData.ticks[highTickIndex].tickIdx);
    }
  }, [poolData, pool, setLowPriceTick, setHighPriceTick]);

  const handleLowPriceDrag = useCallback(
    (newX: number) => {
      if (!poolData || !chartRef.current) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale = chartRect.width / poolData.ticks.length;
      const tickIndex = Math.max(
        0,
        Math.min(Math.round(newX / xScale), poolData.ticks.length - 1)
      );
      const tick = poolData.ticks[tickIndex];

      if (tick && (!highPriceX || newX < highPriceX)) {
        const snappedX = tickIndex * xScale;
        setLowPriceX(snappedX);
      }
    },
    [poolData, highPriceX]
  );

  const handleHighPriceDrag = useCallback(
    (newX: number) => {
      if (!poolData || !chartRef.current) return;
      const chartElement = chartRef.current.querySelector(
        RECHARTS_WRAPPER_SELECTOR
      );
      if (!chartElement) return;

      const chartRect = chartElement.getBoundingClientRect();
      const xScale = chartRect.width / poolData.ticks.length;
      const tickIndex = Math.max(
        0,
        Math.min(Math.round(newX / xScale), poolData.ticks.length - 1)
      );
      const tick = poolData.ticks[tickIndex];

      if (tick && (!lowPriceX || newX > lowPriceX)) {
        // Snap the X position during drag as well
        const snappedX = tickIndex * xScale;
        setHighPriceX(snappedX);
      }
    },
    [poolData, lowPriceX]
  );

  const handleLowPriceDragEnd = useCallback(() => {
    if (!poolData || !chartRef.current || lowPriceX === null) return;
    const chartElement = chartRef.current.querySelector(
      RECHARTS_WRAPPER_SELECTOR
    );
    if (!chartElement) return;

    const chartRect = chartElement.getBoundingClientRect();
    const xScale = chartRect.width / poolData.ticks.length;
    const tickIndex = Math.round(lowPriceX / xScale);
    const tick = poolData.ticks[tickIndex];

    if (tick) {
      // Snap X position to the nearest tick
      const snappedX = tickIndex * xScale;
      setLowPriceX(snappedX);
      // Update the context with the nearest tick
      setLowPriceTick(Number(tick.tickIdx));
    }
  }, [poolData, lowPriceX, setLowPriceTick]);

  const handleHighPriceDragEnd = useCallback(() => {
    if (!poolData || !chartRef.current || highPriceX === null) return;
    const chartElement = chartRef.current.querySelector(
      RECHARTS_WRAPPER_SELECTOR
    );
    if (!chartElement) return;

    const chartRect = chartElement.getBoundingClientRect();
    const xScale = chartRect.width / poolData.ticks.length;
    const tickIndex = Math.round(highPriceX / xScale);
    const tick = poolData.ticks[tickIndex];

    if (tick) {
      // Snap X position to the nearest tick
      const snappedX = tickIndex * xScale;
      setHighPriceX(snappedX);
      // Update the context with the nearest tick
      setHighPriceTick(Number(tick.tickIdx));
    }
  }, [poolData, highPriceX, setHighPriceTick]);

  const renderBar = (props: any) => (
    <CustomBar
      props={props}
      activeTickValue={activeTickValue}
      tickSpacing={tickSpacing}
    />
  );

  /**
   * Custom XAxis tick renderer that colors ticks based on whether they are
   * below or above the current tick value.
   *
   * @param props - props passed by recharts
   * @returns a rendered tick SVG element
   */
  const renderXAxis = (props: any) => (
    <CustomXAxisTick
      props={props}
      activeTickValue={activeTickValue}
      tickSpacing={tickSpacing}
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
            {pool && price0 && (
              <>
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
              </>
            )}
          </div>
        )}
      </motion.div>
      {poolData && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={poolData.ticks}
            margin={
              isTrade ? { bottom: -25 } : { bottom: -25, left: 16, right: 16 }
            }
            onMouseLeave={() => {
              setTickInfo(activeTickValue, currPrice0);
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
                  useMarketUnits={useMarketUnits}
                  isTrade={isTrade}
                />
              }
            />
            <Bar dataKey="liquidityActive" shape={renderBar} />
            {!nftId && !isTrade && (
              <g>
                {/* Left overlay rectangle */}
                <rect
                  x={0}
                  y={0}
                  width={lowPriceX || 50}
                  height="calc(100% - 35px)"
                  className="fill-background"
                  opacity={0.75}
                />
                {/* Right overlay rectangle */}
                <rect
                  x={highPriceX || 350}
                  y={0}
                  width="100%"
                  height="calc(100% - 35px)"
                  className="fill-background"
                  opacity={0.75}
                />
                {chartRef.current && (
                  <>
                    <DraggableHandle
                      x={lowPriceX || 50}
                      y={0}
                      onDrag={handleLowPriceDrag}
                      onDragEnd={handleLowPriceDragEnd}
                      isHighPrice={false}
                      chartRef={chartRef}
                    />
                    <DraggableHandle
                      x={highPriceX || 350}
                      y={0}
                      onDrag={handleHighPriceDrag}
                      onDragEnd={handleHighPriceDragEnd}
                      isHighPrice
                      chartRef={chartRef}
                    />
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
