import dayjs from 'dayjs';
import type React from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useContext, useEffect, useRef, useState, useMemo } from 'react';
import type { TooltipProps } from 'recharts';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  Bar,
  Tooltip,
  Line,
} from 'recharts';

import type { PriceChartData, TimeWindow } from '../interfaces/interfaces';
import { formatXAxisTick, getXTicksToShow } from '../util/chartUtil';
import { formatAmount } from '../util/numberUtil';
import {
  convertGgasPerWstEthToGwei,
  getDisplayTextForVolumeWindow,
} from '../util/util';
import { MarketContext } from '~/lib/context/MarketProvider';
import { colors, gray700, green400, red500 } from '~/lib/styles/theme/colors';

const grayColor = colors.gray?.[700] || gray700;
const redColor = colors.red?.[400] || red500;
const greenColor = colors.green?.[400] || green400;
const CustomBarShape: React.FC<{
  x: number;
  // y: number;
  width: number;
  // height: number;
  payload: any;
  yAxisDomain: [number, number];
  chartHeight: number;
  gridOffsetFromParent: number;
}> = ({
  x,
  width,
  payload,
  yAxisDomain,
  chartHeight,
  gridOffsetFromParent,
}) => {
  if (!payload.close && !payload.open && !payload.high && !payload.low)
    return null;
  const candleColor = payload.open < payload.close ? greenColor : redColor;

  const scaleY = (value: number) => {
    const scaled = (value - yAxisDomain[0]) / (yAxisDomain[1] - yAxisDomain[0]);
    return chartHeight - scaled * chartHeight + gridOffsetFromParent;
  };

  const lowY = scaleY(payload.low);
  const highY = scaleY(payload.high);
  const openY = scaleY(payload.open);
  const closeY = scaleY(payload.close);

  const barHeight = Math.max(Math.abs(openY - closeY), 1);
  const wickHeight = Math.abs(lowY - highY);

  return (
    <>
      {/* Wick */}
      <rect
        x={x + width / 2 - 0.5}
        y={highY}
        width={1}
        height={wickHeight}
        fill={candleColor}
      />
      {/* Body */}
      <rect
        x={x}
        y={Math.min(openY, closeY)}
        width={width}
        height={barHeight}
        fill={candleColor}
        stroke={grayColor}
        strokeWidth={0.5}
        rx="5px"
      />
    </>
  );
};

interface CustomTooltipProps {
  setValue: Dispatch<SetStateAction<string>>; // used for value on hover
  setLabel: Dispatch<SetStateAction<string>>; // used for label of value
}
const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, setValue, setLabel }) => {
  useEffect(() => {
    if (payload && payload[0]) {
      const start = payload[0].payload.startTimestamp;
      const end = payload[0].payload.endTimestamp;
      const startFormatted = dayjs(start).format('MMM D, h:mm A');
      const endFormatted = dayjs(end).format('MMM D, h:mm A');

      const close: number = payload[0].payload.close || 0;

      setValue(formatAmount(close));
      setLabel(`${startFormatted} - ${endFormatted}`);
    }
  }, [payload, setLabel, setValue]);

  if (!payload || !payload[0]) return null;

  const payloadData = payload?.[0]?.payload;
  const close: number | null = payloadData?.close;
  const open: number | null = payloadData?.open;
  const high: number | null = payloadData?.high;
  const low: number | null = payloadData?.low;
  const price = payloadData?.price;
  if (!close && !open && !high && !low && !price) return null;
  return (
    <div className="bg-white p-2 border border-gray-200 rounded-md">
      <p>Close: {close ? formatAmount(close) : '-'}</p>
      <p>Open: {open ? formatAmount(open) : '-'}</p>
      <p>High: {high ? formatAmount(high) : '-'}</p>
      <p>Low: {low ? formatAmount(low) : '-'}</p>
      <p>Price: {price ? formatAmount(price) : '-'}</p>
    </div>
  );
};

interface Props {
  data: {
    marketPrices: PriceChartData[];
    indexPrices: IndexPrice[];
  };
  activeWindow: TimeWindow;
  isLoading: boolean;
}

interface IndexPrice {
  timestamp: number;
  price: number;
}

const CandlestickChart: React.FC<Props> = ({
  data,
  activeWindow,
  isLoading,
}) => {
  const [value, setValue] = useState<string>('');
  const timePeriodLabel = useMemo(() => {
    return getDisplayTextForVolumeWindow(activeWindow);
  }, [activeWindow]);
  const [label, setLabel] = useState<string>(timePeriodLabel);
  const { pool, stEthPerToken, useMarketUnits } = useContext(MarketContext);
  const currPrice: string | number = useMemo(() => {
    return useMarketUnits
      ? pool?.token0Price.toSignificant(18) || 0
      : convertGgasPerWstEthToGwei(
          Number(pool?.token0Price.toSignificant(18) || 0),
          stEthPerToken
        );
  }, [pool?.token0Price, useMarketUnits, stEthPerToken]);
  const [yAxisDomain, setYAxisDomain] = useState<[number, number]>([0, 0]);
  const [chartDimensions, setChartDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [gridOffsetFromParent, setGridOffsetFromParent] = useState(0);

  const chartRef = useRef(null);

  const combinedData = useMemo(() => {
    return data.marketPrices.map((mp, i) => {
      const price = data.indexPrices[i]?.price || 0;
      const priceAdjusted = isLoading ? 0 : price / (stEthPerToken || 1);
      const displayPriceValue = useMarketUnits
        ? priceAdjusted
        : convertGgasPerWstEthToGwei(priceAdjusted, stEthPerToken);
      return {
        ...mp,
        high: useMarketUnits
          ? mp.high
          : convertGgasPerWstEthToGwei(mp.high, stEthPerToken),
        low: useMarketUnits
          ? mp.low
          : convertGgasPerWstEthToGwei(mp.low, stEthPerToken),
        open: useMarketUnits
          ? mp.open
          : convertGgasPerWstEthToGwei(mp.open, stEthPerToken),
        close: useMarketUnits
          ? mp.close
          : convertGgasPerWstEthToGwei(mp.close, stEthPerToken),
        price: displayPriceValue || undefined,
      };
    });
  }, [data, useMarketUnits, stEthPerToken, isLoading]);

  useEffect(() => {
    setLabel(timePeriodLabel);
  }, [timePeriodLabel]);

  const updateChartDimensions = () => {
    if (chartRef.current) {
      const parentElement = (chartRef.current as any).container;
      const gridElement = parentElement?.querySelector(
        '.recharts-cartesian-grid'
      );

      if (gridElement && parentElement) {
        const gridRect = gridElement.getBoundingClientRect();
        const parentRect = parentElement.getBoundingClientRect();

        setChartDimensions({
          width: gridRect.width,
          height: gridRect.height,
        });
        setGridOffsetFromParent(gridRect.top - parentRect.top);
      }
    }
  };

  useEffect(() => {
    const highs = combinedData.map((d) => d.high);
    const indexPrices = combinedData.map((d) => d.price ?? 0);
    const max = Math.max(...highs, ...indexPrices);
    const maxWithBuffer = Math.floor(max * 1.1 + 1);
    setYAxisDomain([0, maxWithBuffer]);
  }, [combinedData]);

  const formatYAxisTick = (value: number) => {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const renderShape = useMemo(() => {
    return (props: any) => {
      return (
        <CustomBarShape
          {...props}
          yAxisDomain={yAxisDomain}
          chartHeight={chartDimensions.height}
          gridOffsetFromParent={gridOffsetFromParent}
        />
      );
    };
  }, [yAxisDomain, chartDimensions.height, gridOffsetFromParent]);

  // Temporary hack, doesn't seem to rendering after initial resizing
  useEffect(() => {
    const timer = setTimeout(() => {
      updateChartDimensions();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-1 relative">
      <div className="min-h-[50px] w-fit absolute top-0 left-0 z-[2] bg-white/80">
        <p className="min-h-[24px]">
          {value
            ? `${value.toLocaleString()}`
            : formatAmount(Number(currPrice))}{' '}
          {useMarketUnits ? 'Ggas/wstETH' : 'gwei'}
        </p>
        <p className="text-sm text-gray-500">{label ? `${label}` : ''}</p>
      </div>
      <ResponsiveContainer
        height="95%"
        width="100%"
        onResize={updateChartDimensions}
      >
        <ComposedChart
          data={combinedData}
          ref={chartRef}
          margin={{ top: 70, right: 0, bottom: 0, left: 0 }}
          onMouseLeave={() => {
            setLabel(timePeriodLabel);
            setValue('');
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="endTimestamp"
            tickFormatter={(timestamp) =>
              formatXAxisTick(timestamp, activeWindow)
            }
            ticks={getXTicksToShow(data.marketPrices, activeWindow)}
            minTickGap={10}
            allowDataOverflow
          />
          <YAxis domain={yAxisDomain} tickFormatter={formatYAxisTick} />
          <Tooltip
            contentStyle={{}}
            content={<CustomTooltip setLabel={setLabel} setValue={setValue} />}
          />
          <Bar dataKey="close" shape={renderShape} />
          <Line
            type="monotone"
            dataKey="price"
            stroke={grayColor}
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CandlestickChart;
