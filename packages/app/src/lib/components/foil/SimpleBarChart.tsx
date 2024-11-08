import { useState } from 'react';
import CountUp from 'react-countup';
import { BarChart, ResponsiveContainer, XAxis, Tooltip, Bar } from 'recharts';

const barColor = 'rgba(0, 0, 0, 0.5)';
const axisColor = 'rgba(0, 0, 0, 0.2)';

const SimpleBarChart = ({ data }: { data: any[] }) => {
  const [value, setValue] = useState<string>('');
  const [prevValue, setPrevValue] = useState<number>(0);
  const [label, setLabel] = useState<string>('');

  return (
    <div className="flex flex-1 relative w-full h-[100px]">
      {value.length ? (
        <div className="min-h-[50px] w-full absolute top-0 left-0 z-[2]">
          <p className="flex items-baseline">
            <span>
              <CountUp
                delay={0}
                start={prevValue}
                end={parseInt(value, 10)}
                duration={0.3}
                separator=","
              />
              {' gas'}
            </span>
            <span className="text-xs text-muted-foreground ml-auto">
              {label}
            </span>
          </p>
        </div>
      ) : null}
      <div className="w-full h-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 30, right: 0, bottom: 0, left: 0 }}
            onMouseMove={(state) => {
              if (state?.activePayload?.[0]) {
                const newValue = state.activePayload[0].value.toString();

                if (newValue !== value) {
                  setPrevValue(parseInt(value, 10) || 0);
                  setValue(newValue);
                  setLabel(
                    `${new Date(
                      state.activePayload[0].payload.timestamp
                    ).toLocaleString(undefined, {
                      year: '2-digit',
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: 'numeric',
                    })} → ${new Date(
                      data[(state.activeTooltipIndex || 0) + 1]?.timestamp ??
                        state.activePayload[0].payload.timestamp
                    ).toLocaleString(undefined, {
                      year: '2-digit',
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: 'numeric',
                    })}`
                  );
                }
              }
            }}
          >
            <XAxis
              axisLine={{ stroke: axisColor, strokeWidth: 1 }}
              tick={false}
              height={1}
            />
            <Bar
              dataKey="value"
              radius={[2, 2, 0, 0]}
              isAnimationActive
              animationDuration={1000}
              barSize={2}
              fill={barColor}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SimpleBarChart;
