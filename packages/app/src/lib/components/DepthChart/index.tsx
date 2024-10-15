'use client';

import { Flex, Text } from '@chakra-ui/react';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import type React from 'react';
import { useContext, useMemo, useState } from 'react';
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
import { paleGreen, purple, turquoise } from '~/lib/styles/theme/colors';

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
}

const CustomBar: React.FC<CustomBarProps> = ({
  props,
  activeTickValue,
  hoveredBar,
  setHoveredBar,
}) => {
  const { x, y, width, height, tick, index } = props;
  let fill = purple; // Default color

  const isClosestTick =
    activeTickValue <= tick + 200 && activeTickValue >= tick - 200;

  if (index === hoveredBar) {
    fill = paleGreen; // Hover color
  } else if (isClosestTick) {
    fill = turquoise; // Active bar color
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

const DepthChart: React.FC<Props> = () => {
  const [hoveredBar, setHoveredBar] = useState<number | null>(null);
  const { pool, chainId, poolAddress, epochParams, collateralAssetDecimals } =
    useContext(MarketContext);

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
    let baseLiquidity = 0; // Using BigInt for precision

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
    console.log('data', data);
    const baseLiquidity = calculateBaseLiquidity(data, pool.tickCurrent);
    console.log('base liquidity', baseLiquidity);
    return createLiquidityDistribution(data, baseLiquidity);
  }, [ticks, data, pool]);

  const renderBar = (props: any) => (
    <CustomBar
      props={props}
      hoveredBar={hoveredBar}
      setHoveredBar={setHoveredBar}
      activeTickValue={pool?.tickCurrent || 0}
    />
  );

  return (
    <Flex flex={1} position="relative">
      {liquidityDepthData.length <= 0 && (
        <Text fontStyle="italic">Loading Liquidity Data...</Text>
      )}
      {liquidityDepthData.length > 0 && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart width={500} height={300} data={liquidityDepthData}>
            <XAxis dataKey="tick" tick={false} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="liquidity" fill="#8884d8" shape={renderBar} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Flex>
  );
};

export default DepthChart;
