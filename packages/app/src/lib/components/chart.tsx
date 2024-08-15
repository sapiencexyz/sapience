import type React from 'react';
import { useContext } from 'react';
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
}: {
  x: number;
  width: number;
  payload: any;
  yAxisDomain: any;
}) => {
  const candleColor =
    payload.open < payload.close
      ? colors.green?.[400] ?? '#00FF00' // Default to a green color
      : colors.red?.[500] ?? '#FF0000';

  const scaleY = (value: number) => {
    return (value - yAxisDomain[0]) / (yAxisDomain[1] - yAxisDomain[0]);
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

  const yAxisDomain = [
    Math.min(...prices.map((p) => p.low)),
    Math.max(...prices.map((p) => p.high)),
  ];

  return (
    <ResponsiveContainer height="100%" width="100%">
      <ComposedChart data={prices}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={yAxisDomain} />
        <Bar
          dataKey="candles"
          shape={(props: any) => {
            return <CustomBarShape {...props} yAxisDomain={yAxisDomain} />;
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
