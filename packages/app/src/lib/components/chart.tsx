import type React from 'react';
import { useContext } from 'react';
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  Bar,
  ReferenceLine,
} from 'recharts';

import { MarketContext } from '~/lib/context/MarketProvider';
import { colors } from '~/lib/styles/theme/colors';

const CustomBarShape = ({
  x,
  y,
  width,
  payload,
  yAxis,
}: {
  x: any;
  y: any;
  width: any;
  payload: any;
  yAxis: any;
}) => {
  const candleColor =
    colors.green &&
    colors.red &&
    (payload.open < payload.close ? colors.green[400] : colors.red[500]);
  const barHeight = Math.abs(yAxis(payload.open) - yAxis(payload.close));
  const wickHeight = Math.abs(yAxis(payload.low) - yAxis(payload.high));
  const wickY = Math.min(yAxis(payload.low), yAxis(payload.high));
  const barY = Math.min(yAxis(payload.open), yAxis(payload.close));

  return (
    <>
      <rect
        x={x + width / 2 - 0.5}
        y={wickY}
        width={1}
        height={wickHeight}
        fill={candleColor}
      />
      <rect
        x={x}
        y={barY}
        width={width}
        height={barHeight}
        fill={candleColor}
      />
    </>
  );
};

const CandlestickChart: React.FC = () => {
  const { averagePrice, prices } = useContext(MarketContext);
  console.log('prices:', prices);

  return (
    <ResponsiveContainer>
      <ComposedChart data={prices}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis
          domain={[0, Math.max(...prices.map((p) => p.high))]}
          tickFormatter={(value) => (value / 10e8).toFixed(2)}
        />
        <Tooltip formatter={(value) => ((value as number) / 10e8).toFixed(2)} />
        <Bar
          dataKey="high"
          // eslint-disable-next-line react/no-unstable-nested-components
          shape={(props: any) => (
            <CustomBarShape
              {...props}
              yAxis={(d: any) => (d / 10e8) * (400 / 15)}
            />
          )}
        />
        <ReferenceLine
          y={averagePrice}
          label="Average Price"
          stroke={colors?.gray && colors.gray[800]}
          strokeDasharray="3 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default CandlestickChart;
