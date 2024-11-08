import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { TooltipProps } from 'recharts';
import { BarChart, ResponsiveContainer, XAxis, Tooltip, Bar } from 'recharts';

const barColor = '#000000';

const generateData = () => {
  return Array.from({ length: 30 }, (_, i) => ({
    id: i,
    value: Math.floor(Math.random() * (1000 - 100 + 1)) + 100, // Random value between 100 and 1000
    timestamp: Date.now() + i * 1000 * 60 * 60, // hourly intervals
  }));
};

interface CustomTooltipProps {
  setValue: Dispatch<SetStateAction<string>>;
  setLabel: Dispatch<SetStateAction<string>>;
}

const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, setValue, setLabel }) => {
  useEffect(() => {
    if (payload && payload[0]) {
      setValue(payload[0].payload.value.toFixed(2));
      setLabel(`Data point ${payload[0].payload.id + 1}`);
    }
  }, [payload, setValue, setLabel]);

  if (!payload || !payload[0]) return null;

  return (
    <div className="bg-background p-2 border border-border rounded-md">
      <p>Value: {payload[0].payload.value.toFixed(2)}</p>
    </div>
  );
};

const SimpleBarChart = () => {
  const [value, setValue] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [data] = useState(() => generateData());

  return (
    <div className="flex flex-1 relative w-full">
      <div className="min-h-[50px] w-fit absolute top-0 left-0 z-[2]">
        <p className="min-h-[24px]">{value}</p>
        <p className="text-sm">{label}</p>
      </div>
      <div className="w-full">
        <ResponsiveContainer width="100%" height="90px">
          <BarChart
            data={data}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            onMouseLeave={() => {
              setValue('');
              setLabel('');
            }}
          >
            <XAxis dataKey="id" />
            <Tooltip
              content={
                <CustomTooltip setValue={setValue} setLabel={setLabel} />
              }
            />
            <Bar
              dataKey="value"
              fill={barColor}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default SimpleBarChart;
