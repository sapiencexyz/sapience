import type React from 'react';
import { useContext } from 'react';
import {
  ResponsiveContainer,
  Line,
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

interface DataPoint {
  date: string;
  open: number;
  close: number;
  low: number;
  high: number;
}

const candlestickData: DataPoint[] = [
  {
    date: '6/19',
    open: 5.123456789,
    close: 7.123456789,
    low: 3.123456789,
    high: 8.123456789,
  },
  {
    date: '6/20',
    open: 6.123456789,
    close: 4.123456789,
    low: 2.123456789,
    high: 9.123456789,
  },
  {
    date: '6/21',
    open: 3.123456789,
    close: 8.123456789,
    low: 2.123456789,
    high: 9.123456789,
  },
  {
    date: '6/22',
    open: 7.123456789,
    close: 2.123456789,
    low: 2.123456789,
    high: 7.123456789,
  },
  {
    date: '6/23',
    open: 4.123456789,
    close: 9.123456789,
    low: 3.123456789,
    high: 10.123456789,
  },
  {
    date: '6/24',
    open: 5.123456789,
    close: 3.123456789,
    low: 2.123456789,
    high: 6.123456789,
  },
  {
    date: '6/25',
    open: 8.123456789,
    close: 4.123456789,
    low: 3.123456789,
    high: 9.123456789,
  },
  {
    date: '6/26',
    open: 6.123456789,
    close: 5.123456789,
    low: 4.123456789,
    high: 7.123456789,
  },
  {
    date: '6/19',
    open: 5.123456789,
    close: 7.123456789,
    low: 3.123456789,
    high: 8.123456789,
  },
  {
    date: '6/20',
    open: 6.123456789,
    close: 4.123456789,
    low: 2.123456789,
    high: 9.123456789,
  },
  {
    date: '6/21',
    open: 3.123456789,
    close: 8.123456789,
    low: 2.123456789,
    high: 9.123456789,
  },
  {
    date: '6/22',
    open: 7.123456789,
    close: 2.123456789,
    low: 2.123456789,
    high: 7.123456789,
  },
  {
    date: '6/23',
    open: 4.123456789,
    close: 9.123456789,
    low: 3.123456789,
    high: 10.123456789,
  },
  {
    date: '6/24',
    open: 5.123456789,
    close: 3.123456789,
    low: 2.123456789,
    high: 6.123456789,
  },
  {
    date: '6/25',
    open: 8.123456789,
    close: 4.123456789,
    low: 3.123456789,
    high: 9.123456789,
  },
  {
    date: '6/26',
    open: 6.123456789,
    close: 5.123456789,
    low: 4.123456789,
    high: 7.123456789,
  },
];

const CustomBarShape = ({ x, y, width, payload, yAxis }) => {
  const candleColor = payload.open < payload.close ? colors.green[400] : colors.red[500];
  const barHeight = Math.abs(yAxis(payload.open) - yAxis(payload.close));
  const wickHeight = Math.abs(yAxis(payload.low) - yAxis(payload.high));
  const wickY = yAxis(payload.low);
  const barY = Math.min(yAxis(payload.open), yAxis(payload.close));

  return (
    <>
      <rect x={x + width / 2 - 0.5} y={wickY} width={1} height={wickHeight} fill={candleColor} />
      <rect x={x} y={barY} width={width} height={barHeight} fill={candleColor} />
    </>
  );
};

const CandlestickChart: React.FC = () => {
  const { averagePrice } = useContext(MarketContext);
  const averagePriceScaled = averagePrice / 10e8;
  return (
    <ResponsiveContainer>
      <ComposedChart data={candlestickData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[0, 15]} />
        <Tooltip />
        <Bar dataKey="high" shape={props => <CustomBarShape {...props} yAxis={d => d * (400 / 15)} />} />
        <ReferenceLine
          y={averagePriceScaled}
          label="Average Price"
          stroke={colors.gray[800]}
          strokeDasharray="3 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export default CandlestickChart;
