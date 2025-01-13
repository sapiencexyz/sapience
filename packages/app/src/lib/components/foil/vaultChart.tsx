import type React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Sample data interface
interface DataPoint {
  date: string;
  value: number;
}

// Generate dates for the last 2 months
const generateLastTwoMonthsData = (): DataPoint[] => {
  const data: DataPoint[] = [];
  const today = new Date();
  const baseValue = 1.1;
  const growthRate = 0.006;

  for (let i = 60; i >= 0; i -= 2) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const trend = ((60 - i) / 2) * growthRate;
    const variation = Math.random() * 0.02 - 0.01;

    data.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      value: Number((baseValue + trend + variation).toFixed(4)),
    });
  }
  return data;
};

const data: DataPoint[] = generateLastTwoMonthsData();

// Add this custom tooltip component
const CustomTooltip: React.FC<any> = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="border border-border rounded-md shadow bg-background p-4">
        <p style={{ margin: 0 }}>
          <div className="text-xl mb-1">
            {payload[0].value} wstETH per fstETH
          </div>
          <div className="text-muted-foreground">
            average on {payload[0].payload.date}
          </div>
        </p>
      </div>
    );
  }
  return null;
};

const VaultChart: React.FC = () => {
  // Calculate min and max values for domain buffer
  const minValue = Math.min(...data.map((d) => d.value));
  const maxValue = Math.max(...data.map((d) => d.value));
  const buffer = (maxValue - minValue) * 0.1;

  return (
    <div style={{ width: "100%", height: "100%" }}>
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
          <YAxis hide domain={[minValue - buffer, maxValue + buffer]} />
          <Tooltip
            content={<CustomTooltip />}
            cursor={false} // Optional: removes the vertical line
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#444444"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default VaultChart;
