import type React from 'react';
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  Bar,
} from 'recharts';

import { colors } from '~/lib/styles/theme/colors';

interface DataPoint {
  date: string;
  open: number;
  close: number;
  low: number;
  high: number;
}

const candlestickData: DataPoint[] = [
  { date: '6/19', open: 40, close: 70, low: 30, high: 80 },
  { date: '6/20', open: 70, close: 60, low: 45, high: 65 },
  { date: '6/21', open: 60, close: 50, low: 48, high: 66 },
  { date: '6/22', open: 50, close: 90, low: 50, high: 95 },
  { date: '6/23', open: 90, close: 80, low: 65, high: 85 },
  { date: '6/24', open: 80, close: 110, low: 70, high: 120 },
  { date: '6/25', open: 110, close: 100, low: 85, high: 105 },
  { date: '6/26', open: 100, close: 95, low: 75, high: 100 },
];

const lineData = [
  { date: '6/19', value: 50 },
  { date: '6/20', value: 60 },
  { date: '6/21', value: 55 },
  { date: '6/22', value: 70 },
  { date: '6/23', value: 65 },
  { date: '6/24', value: 80 },
  { date: '6/25', value: 90 },
  { date: '6/26', value: 85 },
];

const CustomBarShape = (props: any) => {
  const { x, width, payload } = props;
  const candleColor = payload.open < payload.close ? colors.red[500] : colors.green[400];
  const barHeight = Math.abs(payload.close - payload.open);
  const wickHeight = Math.abs(payload.high - payload.low);
  const wickY = payload.low;
  const barY = Math.min(payload.open, payload.close);

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

const CandlestickChart: React.FC = () => (
  <ResponsiveContainer>
    <ComposedChart data={candlestickData}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis domain={[0, 110]} />
      <Tooltip />
      <Bar dataKey="high" shape={<CustomBarShape />} />
      <Line
        type="monotone"
        data={lineData}
        dataKey="value"
        stroke={colors.gray[800]}
        strokeDasharray="6 3"
        strokeWidth="2"
        dot={false}
      />
    </ComposedChart>
  </ResponsiveContainer>
);

export default CandlestickChart;
