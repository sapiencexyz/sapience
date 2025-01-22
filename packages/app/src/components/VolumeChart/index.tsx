import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type React from 'react';
import type { TooltipProps } from 'recharts';
import {
  BarChart,
  ResponsiveContainer,
  XAxis,
  Tooltip,
  Bar,
  YAxis,
} from 'recharts';

import type { VolumeChartData, TimeWindow } from '~/lib/interfaces/interfaces';
import { formatXAxisTick, getXTicksToShow } from '~/lib/util/chartUtil';
import { getDisplayTextForVolumeWindow } from '~/lib/util/util';

const barColor = 'hsl(var(--chart-3))';

dayjs.extend(utc);

export type ChartProps = {
  data: VolumeChartData[];
  activeWindow: TimeWindow;
  color?: string | undefined;
  height?: number | undefined;
} & React.HTMLAttributes<HTMLDivElement>;

interface CustomTooltipProps {
  setValue: Dispatch<SetStateAction<number>>; // used for value on hover
  setLabel: Dispatch<SetStateAction<string>>; // used for label of value
}
const CustomBar = ({
  x,
  y,
  width,
  height,
  fill,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}) => {
  if (isNaN(x) || isNaN(y) || isNaN(width) || isNaN(height)) {
    return null;
  }
  return (
    <g>
      <rect x={x} y={y} fill={fill} width={width} height={height} rx="2" />
    </g>
  );
};

const CustomTooltip: React.FC<
  TooltipProps<number, string> & CustomTooltipProps
> = ({ payload, setValue, setLabel }) => {
  useEffect(() => {
    if (payload && payload[0]) {
      const start = payload[0].payload.startTimestamp;
      const end = payload[0].payload.endTimestamp;
      const startFormatted = dayjs(start).format('MMM D, h:mm A');
      const endFormatted = dayjs(end).format('MMM D, h:mm A');

      setValue(payload[0].payload.volume || 0);
      setLabel(`${startFormatted} - ${endFormatted}`);
    }
  }, [payload, setLabel, setValue]);

  if (!payload || !payload[0]) return null;

  const fee = payload[0].payload?.fee;
  if (!fee) return null;

  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: '8px',
        border: '1px solid #ccc',
      }}
    >
      <p>{`Fee: ${fee}`}</p>
    </div>
  );
};

const VolumeChart = ({ data, color = barColor, activeWindow }: ChartProps) => {
  const volumeOverTimeframe = useMemo(() => {
    return data.reduce((sum, item) => {
      return sum + item.volume;
    }, 0);
  }, [data]);

  const timePeriodLabel = useMemo(() => {
    return getDisplayTextForVolumeWindow(activeWindow);
  }, [activeWindow]);

  const [value, setValue] = useState<number>(volumeOverTimeframe);
  const [label, setLabel] = useState<string>(timePeriodLabel);

  useEffect(() => {
    setValue(volumeOverTimeframe);
  }, [volumeOverTimeframe]);

  useEffect(() => {
    setLabel(timePeriodLabel);
  }, [timePeriodLabel]);

  const renderCustomBar = (props: any) => {
    const { x, y, width, height } = props;
    return <CustomBar x={x} y={y} width={width} height={height} fill={color} />;
  };

  return (
    <div className="flex flex-1 relative">
      <div className="min-h-[50px] w-fit absolute top-0 left-0 z-[2] bg-background opacity-80">
        <p className="text-base">
          {value ? `${value.toLocaleString()} Ggas` : '0 Ggas'}
        </p>
        <p className="text-sm text-gray-500">{label ? `${label}` : ''}</p>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          width={500}
          height={300}
          data={data}
          margin={{
            top: 50,
            right: 10,
            left: 10,
            bottom: 5,
          }}
          onMouseLeave={() => {
            if (setLabel) setLabel(timePeriodLabel);
            if (setValue) setValue(volumeOverTimeframe);
          }}
        >
          <YAxis
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickFormatter={(volume: number) =>
              volume === 0 ? '' : `${volume.toFixed(4)}`
            }
          />
          <XAxis
            dataKey="endTimestamp"
            axisLine={false}
            tickLine={false}
            tickFormatter={(timestamp) =>
              formatXAxisTick(timestamp, activeWindow)
            }
            ticks={getXTicksToShow(data, activeWindow)}
            minTickGap={10}
          />
          <Tooltip
            contentStyle={{}}
            content={<CustomTooltip setLabel={setLabel} setValue={setValue} />}
          />
          <Bar dataKey="volume" fill={color} shape={renderCustomBar} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default VolumeChart;
