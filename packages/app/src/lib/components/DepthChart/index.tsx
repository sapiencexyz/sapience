'use client';

import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { Pool } from '@uniswap/v3-sdk';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { TooltipProps } from 'recharts';
import {
  BarChart,
  ResponsiveContainer,
  XAxis,
  Tooltip,
  Bar,
  YAxis,
} from 'recharts';
import { type AbiFunction } from 'viem';
import { useReadContracts } from 'wagmi';

import { TICK_SPACING_DEFAULT } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';
import type {
  BarChartTick,
  GraphTick,
  PoolData,
} from '~/lib/util/liquidityUtil';
import { getFullPool } from '~/lib/util/liquidityUtil';

const gray400 = 'hsl(var(--chart-3))';
const paleGreen = 'hsl(var(--chart-3))';
const purple = 'hsl(var(--chart-5))';
const turquoise = 'hsl(var(--chart-4))';
const peach = 'hsl(var(--chart-2))';

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
  hoveredBar: number | null;
  setHoveredBar: React.Dispatch<React.SetStateAction<number | null>>;
  tickSpacing: number;
}

const CustomBar: React.FC<CustomBarProps> = ({
  props,
  activeTickValue,
  hoveredBar,
  setHoveredBar,
  tickSpacing,
}) => {
  const { x, y, width, height, tickIdx, index } = props;
  let fill = purple; // Default color

  const isClosestTick = checkIsClosestTick(
    tickIdx,
    activeTickValue,
    tickSpacing
  );
  if (index === hoveredBar) {
    fill = paleGreen; // Hover color
  } else if (isClosestTick) {
    fill = turquoise; // Active bar color
  } else if (tickIdx < activeTickValue) {
    fill = peach;
  }
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      onMouseEnter={() => setHoveredBar(index)}
      onMouseLeave={() => setHoveredBar(null)}
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
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="middle"
        fill={gray400}
        fontSize={12}
      >
        Active tick range
      </text>
    </g>
  );
};
interface CustomTooltipProps {
  pool: Pool | null;
  setPrice1: Dispatch<SetStateAction<number>>; // used for price1 value on hover
  setPrice0: Dispatch<SetStateAction<number>>; // used for price0 value on hover
  setLabel: Dispatch<SetStateAction<string>>; // used for label of value
}
const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, pool, setPrice0, setLabel, setPrice1 }) => {
  useEffect(() => {
    if (payload && payload[0]) {
      const tick: BarChartTick = payload[0].payload;
      setPrice0(tick.price0);
      setPrice1(tick.price1);
      setLabel(`Tick ${tick.tickIdx}`);
    }
  }, [payload, setLabel, setPrice0, setPrice1]);

  if (!payload || !payload[0] || !pool) return null;
  const tick: BarChartTick = payload[0].payload;

  return (
    <div
      style={{
        padding: '8px',
        border: '1px solid #ccc',
      }}
      className="bg-background"
    >
      {(tick.tickIdx <= pool.tickCurrent || tick.isCurrent) && (
        <p>
          {pool.token1.symbol} Liquidity:{' '}
          {(tick.liquidityLockedToken1 / tick.price0).toFixed(3)}
        </p>
      )}
      {(tick.tickIdx >= pool.tickCurrent || tick.isCurrent) && (
        <p>
          {pool.token0.symbol} Liquidity:{' '}
          {(tick.liquidityLockedToken0 / tick.price0).toFixed(3)}
        </p>
      )}
      <p>Tick {tick.tickIdx}</p>
    </div>
  );
};

const DepthChart: React.FC = () => {
  const [poolData, setPool] = useState<PoolData | undefined>();
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const [price0, setPrice0] = useState<number>(0);
  const [price1, setPrice1] = useState<number>(0);
  const [label, setLabel] = useState<string>('');
  const {
    pool,
    chainId,
    poolAddress,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
  } = useContext(MarketContext);
  const activeTickValue = pool?.tickCurrent || 0;
  const tickSpacing = pool ? pool?.tickSpacing : TICK_SPACING_DEFAULT;
  useEffect(() => {
    if (activeTickValue) {
      setLabel(`Active Tick Value: ${activeTickValue}`);
    }
  }, [activeTickValue]);

  const ticks = useMemo(() => {
    const tickRange: number[] = [];
    for (
      let i = baseAssetMinPriceTick;
      i < baseAssetMaxPriceTick + tickSpacing;
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
      getFullPool(pool, graphTicks, tickSpacing).then((fullPoolData) =>
        setPool(fullPoolData)
      );
    }
  }, [pool, graphTicks, tickSpacing]);

  const [currPrice0, currPrice1] = useMemo(() => {
    const currTick = poolData?.ticks.filter((t) => t.isCurrent);
    if (currTick) {
      return [currTick[0].price0, currTick[0].price1];
    }
    return [0, 0];
  }, [poolData]);

  useEffect(() => {
    setPrice0(currPrice0);
    setPrice1(currPrice1);
  }, [currPrice0, currPrice1]);

  const renderBar = (props: any) => (
    <CustomBar
      props={props}
      hoveredBar={hoveredBar}
      setHoveredBar={setHoveredBar}
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
    <div className="flex flex-1 relative">
      <div className="min-h-[50px] w-fit absolute top-0 left-0 z-[2] bg-background">
        {pool && price0 && (
          <div>
            <p className="text-base">
              {` 1${pool.token0.symbol} = ${price0.toFixed(4)}
        ${pool.token1.symbol}`}
            </p>
            <p className="text-base">
              {` 1${pool.token1.symbol} = ${price1.toFixed(4)}
        ${pool.token0.symbol}`}
            </p>
          </div>
        )}
        <p className="text-sm text-gray-500">{label ? `${label}` : ''}</p>
      </div>
      {!poolData && <div className="italic">Loading Liquidity Data...</div>}
      {poolData && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={poolData.ticks}
            margin={{ top: 70, bottom: -40 }}
            onMouseLeave={() => {
              setLabel(`Active Tick Value: ${activeTickValue}`);
              setPrice0(currPrice0);
              setPrice1(currPrice1);
            }}
          >
            <XAxis
              dataKey="tickIdx"
              tick={renderXAxis}
              height={60}
              interval={0}
              tickLine={false}
            />
            <Tooltip
              content={
                <CustomTooltip
                  pool={pool}
                  setLabel={setLabel}
                  setPrice0={setPrice0}
                  setPrice1={setPrice1}
                />
              }
            />
            <Bar dataKey="liquidityActive" shape={renderBar} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default DepthChart;
