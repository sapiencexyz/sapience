import type React from 'react';
import { useContext, useEffect, useRef, useState } from 'react';
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

const CustomBarShape = ({
  x,
  width,
  payload,
  yAxisDomain,
  chartHeight,
  gridOffsetFromParent,
}: {
  x: number;
  width: number;
  payload: any;
  yAxisDomain: any;
  chartHeight: number;
  gridOffsetFromParent: number;
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
  console.log('prices', prices);

  const yAxisDomain = [
    Math.min(...prices.map((p) => p.low)),
    Math.max(...prices.map((p) => p.high)),
  ];

  const chartRef = useRef(null);
  const [gridHeight, setGridHeight] = useState(0);
  const [gridOffsetFromParent, setGridOffsetFromParent] = useState(0);

  useEffect(() => {
    if (chartRef.current) {
      // Access the parent container and the CartesianGrid's bounding boxes
      const parentElement = (chartRef.current as any).container;
      const gridElement = parentElement.querySelector(
        '.recharts-cartesian-grid'
      );

      if (gridElement && parentElement) {
        const gridRect = gridElement.getBoundingClientRect();
        const parentRect = parentElement.getBoundingClientRect();

        // Calculate the height of the CartesianGrid
        setGridHeight(gridRect.height);

        // Calculate the offset from the top of the parent container
        setGridOffsetFromParent(gridRect.top - parentRect.top);
      }
    }
  }, [prices]);

  return (
    <ResponsiveContainer height="100%" width="100%">
      <ComposedChart data={prices} ref={chartRef}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={yAxisDomain} />
        <Bar
          dataKey="candles"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, react/no-unstable-nested-components
          shape={(props: any) => {
            return (
              <CustomBarShape
                {...props}
                yAxisDomain={yAxisDomain}
                chartHeight={gridHeight}
                gridOffsetFromParent={gridOffsetFromParent}
              />
            );
          }}
        />
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
