import { motion } from 'framer-motion';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import CountUp from 'react-countup';
import type { TooltipProps } from 'recharts';
import { BarChart, ResponsiveContainer, XAxis, Tooltip, Bar } from 'recharts';

const barColor = 'rgba(0, 0, 0, 0.5)';

const generateData = () => {
  return Array.from({ length: 50 }, (_, i) => ({
    id: i,
    value: Math.floor(Math.random() * (1000 - 100 + 1)) + 100, // Random value between 100 and 1000
    timestamp: Date.now() + i * 1000 * 60 * 60, // hourly intervals
  }));
};

const SimpleBarChart = () => {
  const [value, setValue] = useState<string>('');
  const [prevValue, setPrevValue] = useState<number>(0);
  const [label, setLabel] = useState<string>('');
  const [data] = useState(() => generateData());

  return (
    <div className="flex flex-1 relative w-full h-[100px]">
      {value.length ? (
        <div className="min-h-[50px] w-fit absolute top-0 left-0 z-[2]">
          <p>
            <CountUp
              delay={0}
              start={prevValue}
              end={parseInt(value, 10)}
              duration={0.3}
              separator=","
            />
            {' gas '}
            <span className="text-sm text-muted-foreground ml-1">{label}</span>
          </p>
        </div>
      ) : null}
      <div className="w-full h-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 25, right: 0, bottom: 0, left: 0 }}
            onMouseMove={(state) => {
              if (state?.activePayload?.[0]) {
                const newValue = state.activePayload[0].value.toString();
                if (newValue !== value) {
                  setPrevValue(parseInt(value, 10) || 0);
                  setValue(newValue);
                  setLabel(
                    new Date(
                      state.activePayload[0].payload.timestamp
                    ).toLocaleString()
                  );
                }
              }
            }}
          >
            <XAxis
              axisLine={{ stroke: barColor, strokeWidth: 1 }}
              tick={false}
              height={1}
            />
            <Bar
              dataKey="value"
              fill={barColor}
              radius={[2, 2, 0, 0]}
              isAnimationActive
              animationDuration={1500}
              barSize={2}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SimpleBarChart;
