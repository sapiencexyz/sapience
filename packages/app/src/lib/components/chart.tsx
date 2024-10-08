import { Box, Flex, Text } from '@chakra-ui/react';
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
  ReferenceLine,
  Label,
  Tooltip,
} from 'recharts';

import type { PriceChartData, TimeWindow } from '../interfaces/interfaces';
import { formatXAxisTick, getXTicksToShow } from '../util/chartUtil';
import { formatAmount } from '../util/numberUtil';
import { getDisplayTextForVolumeWindow } from '../util/util';
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
  const candleColor = payload.open < payload.close ? greenColor : redColor;

  const scaleY = (value: number) => {
    const scaled = (value - yAxisDomain[0]) / (yAxisDomain[1] - yAxisDomain[0]);
    return chartHeight - scaled * chartHeight + gridOffsetFromParent;
  };

  const lowY = scaleY(payload.low);
  const highY = scaleY(payload.high);
  const openY = scaleY(payload.open);
  const closeY = scaleY(payload.close);

  const barHeight = Math.abs(openY - closeY);
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
  if (!close && !open && !high && !low) return null;
  return (
    <Box
      style={{
        backgroundColor: 'white',
        padding: '8px',
        border: '1px solid #ccc',
      }}
    >
      <Text>Close: {close ? formatAmount(close) : '-'}</Text>
      <Text>Open: {open ? formatAmount(open) : '-'}</Text>
      <Text>High: {high ? formatAmount(high) : '-'}</Text>
      <Text>Low: {low ? formatAmount(low) : '-'}</Text>
    </Box>
  );
};

interface Props {
  data: PriceChartData[];
  activeWindow: TimeWindow;
}
const CandlestickChart: React.FC<Props> = ({ data, activeWindow }) => {
  const [value, setValue] = useState<string>('');
  const timePeriodLabel = useMemo(() => {
    return getDisplayTextForVolumeWindow(activeWindow);
  }, [activeWindow]);
  const [label, setLabel] = useState<string>(timePeriodLabel);
  const { averagePrice, pool } = useContext(MarketContext);
  const currPrice: string = useMemo(() => {
    return pool?.token0Price.toSignificant(18) || '0';
  }, [pool?.token0Price]);
  const [yAxisDomain, setYAxisDomain] = useState<[number, number]>([0, 0]);
  const [chartDimensions, setChartDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [gridOffsetFromParent, setGridOffsetFromParent] = useState(0);

  const chartRef = useRef(null);

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
    const validPrices = data.filter((p) => p.high !== null);
    setYAxisDomain([0, Math.max(...validPrices.map((p) => p.high)) + 1]);
  }, [data]);

  const formatYAxisTick = (value: number) => value.toFixed(2);

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

  const averagePriceLabel = (
    <Label
      value={`Average Index Price ${averagePrice}`}
      position="top"
      offset={-13}
      fill={grayColor}
      fontSize={12}
    />
  );

  return (
    <Flex flex={1} position="relative">
      <Box
        minH="50px"
        w="fit-content"
        position="absolute"
        top={0}
        left={0}
        zIndex={2}
        bgColor="white"
        opacity={0.8}
      >
        <Text minH="24px">
          {' '}
          {value
            ? `${value.toLocaleString()}`
            : formatAmount(Number(currPrice))}{' '}
          Ggas/wstETH
        </Text>
        <Text fontSize="sm" color="gray.500">
          {' '}
          {label ? `${label}` : ''}
        </Text>
      </Box>
      <ResponsiveContainer
        height="95%"
        width="100%"
        onResize={updateChartDimensions}
      >
        <ComposedChart
          data={data}
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
            ticks={getXTicksToShow(data, activeWindow)}
            minTickGap={10}
            allowDataOverflow
          />
          <YAxis domain={yAxisDomain} tickFormatter={formatYAxisTick} />
          <Tooltip
            contentStyle={{}}
            content={<CustomTooltip setLabel={setLabel} setValue={setValue} />}
          />
          <Bar dataKey="close" shape={renderShape} />
          {averagePrice > 0 && (
            <ReferenceLine
              y={averagePrice}
              stroke={grayColor}
              strokeDasharray="3 3"
              label={averagePriceLabel}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </Flex>
  );
};

export default CandlestickChart;
