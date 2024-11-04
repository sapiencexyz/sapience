'use client';

import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type React from 'react';
import { useContext, useMemo, useState } from 'react';
import type { TooltipProps } from 'recharts';
import {
  BarChart,
  ResponsiveContainer,
  XAxis,
  Tooltip,
  Bar,
  YAxis,
} from 'recharts';
import { formatUnits, type AbiFunction } from 'viem';
import { useReadContracts } from 'wagmi';

import { TICK_SPACING_DEFAULT } from '~/lib/constants/constants';
import { MarketContext } from '~/lib/context/MarketProvider';
import { formatAmount } from '~/lib/util/numberUtil';

const gray400 = '#a3a3a3';
const paleGreen = '#98fb98';
const purple = '#800080';
const turquoise = '#00ffd1';
const peach = '#ffa07a';

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

interface LiquidityPoint {
  tick: number;
  liquidity: number;
  name: string;
}

interface Props {}

interface CustomBarProps {
  props: {
    x: number;
    y: number;
    width: number;
    height: number;
    tick: number;
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
  const { x, y, width, height, tick, index } = props;
  let fill = purple; // Default color

  const isClosestTick = checkIsClosestTick(tick, activeTickValue, tickSpacing);
  if (index === hoveredBar) {
    fill = paleGreen; // Hover color
  } else if (isClosestTick) {
    fill = turquoise; // Active bar color
  } else if (tick < activeTickValue) {
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
  tickSpacing: number;
}
const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, tickSpacing }) => {
  if (!payload || !payload[0]) return null;
  const tickValue: number = payload[0].payload?.tick;
  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: '8px',
        border: '1px solid #ccc',
      }}
    >
      <p>{`Tick Range: ${tickValue}-${tickValue + tickSpacing}`}</p>
      <p>{`Liquidity: ${formatAmount(payload[0].payload?.liquidity)}`}</p>
    </div>
  );
};

const DepthChart: React.FC<Props> = () => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const { pool, chainId, poolAddress, epochParams, collateralAssetDecimals } =
    useContext(MarketContext);
  const activeTickValue = pool?.tickCurrent || 0;
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

  const { data, isLoading: isLoadingContracts } = useReadContracts({
    contracts,
  }) as { data: TickData[]; isLoading: boolean };

  function calculateBaseLiquidity(
    tickData: TickData[],
    currentTick: number
  ): number {
    let baseLiquidity = 0;

    for (let i = 0; i < tickData.length; i++) {
      const tick = ticks[i];
      const tickInfo = tickData[i];
      if (tick >= currentTick) {
        break;
      }
      if (!tickInfo.result) {
        console.log('no result for tick idx', i, '...data is ', tickData);
        break;
      }
      const liquidityNet = tickInfo.result[1];
      const liquidityNetNum = Number(
        formatUnits(liquidityNet, collateralAssetDecimals)
      );
      baseLiquidity += liquidityNetNum;
    }

    return baseLiquidity;
  }

  function createLiquidityDistribution(
    tickData: TickData[],
    baseL: number
  ): LiquidityPoint[] {
    const distribution: LiquidityPoint[] = [];
    let cumulativeLiquidity = baseL;

    tickData.forEach((tickInfo, index) => {
      if (!tickInfo.result) {
        console.log('no result for tick idx', index, '...data is ', tickData);
        return;
      }
      const liquidityNet = tickInfo.result[1];
      const liquidityNetNum = Number(
        formatUnits(liquidityNet, collateralAssetDecimals)
      );

      cumulativeLiquidity += liquidityNetNum;
      distribution.push({
        tick: ticks[index],
        liquidity: cumulativeLiquidity,
        name: `tick ${index} liquidity ${cumulativeLiquidity}`,
      });
    });

    return distribution;
  }

  const liquidityDepthData = useMemo(() => {
    if (!data || !pool || !ticks.length || !data.length) return [];
    const baseLiquidity = calculateBaseLiquidity(data, activeTickValue);
    return createLiquidityDistribution(data, baseLiquidity);
  }, [ticks, data, pool]);

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
      {liquidityDepthData.length <= 0 && (
        <div className="italic">Loading Liquidity Data...</div>
      )}
      {liquidityDepthData.length > 0 && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart width={500} height={300} data={liquidityDepthData}>
            <XAxis
              dataKey="tick"
              tick={renderXAxis}
              height={60}
              interval={0}
              tickLine={false}
            />
            <YAxis />
            <Tooltip content={<CustomTooltip tickSpacing={tickSpacing} />} />
            <Bar dataKey="liquidity" shape={renderBar} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default DepthChart;
