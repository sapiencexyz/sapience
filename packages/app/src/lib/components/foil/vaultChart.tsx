import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Sample data interface
interface DataPoint {
  date: string;
  value: number;
}

// Sample data
const data: DataPoint[] = [
  { date: '2024-01', value: 4000 },
  { date: '2024-02', value: 3000 },
  { date: '2024-03', value: 5000 },
  { date: '2024-04', value: 2780 },
  { date: '2024-05', value: 1890 },
  { date: '2024-06', value: 2390 },
  { date: '2024-07', value: 3490 },
];

const VaultChart: React.FC = () => {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{
            top: 0,
            right: 0,
            left: 0,
            bottom: 0,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#8884d8"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default VaultChart;
