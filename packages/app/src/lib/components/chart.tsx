import { format } from 'date-fns';
import type React from 'react';
import { useContext, useEffect, useRef, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  ComposedChart,
  Bar,
  ReferenceLine,
} from 'recharts';

import { MarketContext } from '~/lib/context/MarketProvider';
import { colors } from '~/lib/styles/theme/colors';

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
  const candleColor = payload.open < payload.close ? '#3FBC44' : '#FF0000';

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
      />
    </>
  );
};

const CandlestickChart: React.FC = () => {
  const grayColor = colors.gray?.[800] ?? '#808080';

  const { averagePrice, prices } = useContext(MarketContext);

  const [yAxisDomain, setYAxisDomain] = useState<[number, number]>([0, 0]);
  const [chartDimensions, setChartDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [gridOffsetFromParent, setGridOffsetFromParent] = useState(0);

  const chartRef = useRef(null);

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
    setYAxisDomain([0, Math.max(...prices.map((p) => p.high)) + 1]);
  }, [prices]);

  useEffect(() => {
    updateChartDimensions();
    window.addEventListener('resize', updateChartDimensions);

    return () => {
      window.removeEventListener('resize', updateChartDimensions);
    };
  }, []);

  const formatXAxisTick = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'MMM d');
  };

  const formatYAxisTick = (value: number) => value.toFixed(2);

  const renderShape = useMemo(() => {
    return (props: any) => (
      <CustomBarShape
        {...props}
        yAxisDomain={yAxisDomain}
        chartHeight={chartDimensions.height}
        gridOffsetFromParent={gridOffsetFromParent}
      />
    );
  }, [yAxisDomain, chartDimensions.height, gridOffsetFromParent]);

  // Temporary hack, doesn't seem to rendering after initial resizing
  useEffect(() => {
    const timer = setTimeout(() => {
      updateChartDimensions();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ResponsiveContainer height="95%" width="100%">
      <ComposedChart
        data={prices}
        ref={chartRef}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={formatXAxisTick} />
        <YAxis domain={yAxisDomain} tickFormatter={formatYAxisTick} />
        <Bar dataKey="candles" shape={renderShape} />
        <ReferenceLine
          y={averagePrice}
          label="Average Price"
          stroke={grayColor}
          strokeDasharray="3 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default CandlestickChart;
