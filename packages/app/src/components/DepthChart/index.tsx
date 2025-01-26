'use client';

import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type { Pool } from '@uniswap/v3-sdk';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useContext, useEffect, useMemo, useState, useCallback } from 'react';
import type { TooltipProps } from 'recharts';
import { BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Bar } from 'recharts';
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
import { convertWstEthToGwei } from '~/lib/util/util';
import NumberDisplay from '~/components/numberDisplay';

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
}

const CustomTooltip: React.FC<TooltipProps<number, string> & CustomTooltipProps> = ({ 
  payload, 
  pool,
  onTickInfo,
  useMarketUnits
}) => {
  useEffect(() => {
    if (payload && payload[0]) {
      const tick: BarChartTick = payload[0].payload;
      onTickInfo(tick.tickIdx, tick.price0, tick.price1);
    }
  }, [payload, onTickInfo]);

  if (!payload || !payload[0] || !pool) return null;
  const tick: BarChartTick = payload[0].payload;

  return (
    <div className="bg-background p-3 border border-border rounded-sm shadow-sm">
      <p className="text-xs font-medium text-gray-500 mb-0.5">Liquidity</p>
      {tick.tickIdx < pool.tickCurrent && !tick.isCurrent && (
        <>
          <p>
            {tick.liquidityLockedToken1.toFixed(4)}{' '}{useMarketUnits ? 'Ggas' : 'gas'}
          </p>
          <p>
             0 {useMarketUnits ? 'wstETH' : 'gwei'}
          </p>
        </>
      )}
      {tick.tickIdx > pool.tickCurrent && !tick.isCurrent && (
        <>
          <p>
            0 {useMarketUnits ? 'Ggas' : 'gas'}
          </p>
          <p>
            {tick.liquidityLockedToken0.toFixed(4)} {useMarketUnits ? 'wstETH' : 'gwei'}{' '}
          </p>
        </>
      )}
      {tick.isCurrent && (
        <>
          <p>
            {tick.liquidityLockedToken1.toFixed(4)} {useMarketUnits ? 'Ggas' : 'gas'}
          </p>
          <p>
            {tick.liquidityLockedToken0.toFixed(4)} {useMarketUnits ? 'wstETH' : 'gwei'}
          </p>
        </>
      )}
    </div>
  );
};

const DepthChart: React.FC = () => {
  const [poolData, setPool] = useState<PoolData | undefined>();
  const [price0, setPrice0] = useState<number>(0);
  const [price1, setPrice1] = useState<number>(0);
  const [label, setLabel] = useState<string>('');
  const {
    pool,
    chainId,
    poolAddress,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    useMarketUnits,
    stEthPerToken
  } = useContext(MarketContext);

  const setTickInfo = useCallback((tickIdx: number, rawPrice0: number, rawPrice1: number) => {
    const convertedPrice0 = useMarketUnits ? rawPrice0 : convertWstEthToGwei(rawPrice0, stEthPerToken);
    const convertedPrice1 = useMarketUnits ? rawPrice1 : convertWstEthToGwei(rawPrice1, stEthPerToken);
    setPrice0(convertedPrice0);
    setPrice1(convertedPrice1);
    setLabel(`Tick ${tickIdx}`);
  }, [useMarketUnits, stEthPerToken]);

  const activeTickValue = pool?.tickCurrent || 0;
  const tickSpacing = pool ? pool?.tickSpacing : TICK_SPACING_DEFAULT;

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

  console.log('tickData', tickData);

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

  const isCurrentPrice = useMemo(() => {
    if (!price0 || !currPrice0) return false;
    const displayPrice = useMarketUnits ? price0 : convertWstEthToGwei(price0, stEthPerToken);
    const displayCurrPrice = useMarketUnits ? currPrice0 : convertWstEthToGwei(currPrice0, stEthPerToken);
    return displayPrice === displayCurrPrice;
  }, [price0, currPrice0, useMarketUnits, stEthPerToken]);

  useEffect(() => {
    if (currPrice0 && currPrice1) {
      setPrice0(currPrice0);
      setPrice1(currPrice1);
      if (activeTickValue) {
        setTickInfo(activeTickValue, currPrice0, currPrice1);
      }
    }
  }, [currPrice0, currPrice1, activeTickValue, setTickInfo]);

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
    <div className="flex flex-1 flex-col p-4">
    {!poolData && (
      <div className="flex items-center justify-center h-full w-full">
        <div className="animate-spin rounded-full h-6 w-6 border-b-4 border-primary opacity-10" />
      </div>
    )}
      <div className="w-fit">
        <p className="text-xs font-medium text-gray-500 mb-0.5">{label ? `${label}` : ''}</p>
        {pool && price0 && (
          <div className="flex items-center">
            {isCurrentPrice && <span className="mr-1">Current Price: </span>}
            <NumberDisplay value={useMarketUnits ? price0 : convertWstEthToGwei(price0, stEthPerToken)} precision={4} />
            <span className="ml-1">{useMarketUnits ? 'Ggas/wstETH' : 'gwei'}</span>
          </div>
        )}
      </div>
      {poolData && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={poolData.ticks}
            margin={{ bottom: -25, left: 0, right: 0 }}

            onMouseLeave={() => {
              setTickInfo(activeTickValue, currPrice0, currPrice1);
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
