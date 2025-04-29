import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import {
  type Dispatch,
  type SetStateAction,
  useContext,
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

import NumberDisplay from '~/components/numberDisplay';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import type { VolumeChartData, TimeWindow } from '~/lib/interfaces/interfaces';
import { formatXAxisTick, getXTicksToShow } from '~/lib/utils/chartUtil';
import { getDisplayTextForVolumeWindow, foilApi } from '~/lib/utils/util';

const barColor = '#58585A';

dayjs.extend(utc);

export type ChartProps = {
  contractId: string;
  marketId: string;
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
  const { unitDisplay } = useContext(PeriodContext);

  if (!payload || !payload[0]) return null;

  const volume = payload[0].payload?.volume;
  if (!volume) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="bg-background p-3 border border-border rounded-sm shadow-sm"
      >
        <p className="text-xs font-medium text-gray-500 mb-0.5">Volume</p>
        <p>
          <NumberDisplay value={volume} /> {unitDisplay(false)}
        </p>
      </motion.div>
    </AnimatePresence>
  );
};

const VolumeChart = ({
  contractId,
  marketId,
  color = barColor,
  activeWindow,
}: ChartProps) => {
  const {
    data: volumeData,
    error: volumeError,
    isLoading,
  } = useQuery({
    queryKey: ['volume', contractId, marketId, activeWindow],
    queryFn: async () => {
      return foilApi.get(
        `/volume?contractId=${contractId}&marketId=${marketId}&timeWindow=${activeWindow}`
      );
    },
    enabled: !!contractId && !!marketId && !!activeWindow,
    retry: 3,
  });

  const { unitDisplay } = useContext(PeriodContext);

  useEffect(() => {
    if (volumeError) {
      console.error('Volume data fetch error:', volumeError);
    }
  }, [volumeError]);

  const volumeOverTimeframe = useMemo(() => {
    return (volumeData || []).reduce((sum: number, item: VolumeChartData) => {
      return sum + (item.volume || 0);
    }, 0);
  }, [volumeData]);

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
    <div className="flex flex-1 flex-col p-4 relative">
      {isLoading && (
        <div className="absolute top-4 right-16 md:top-8 md:right-24 z-10">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground opacity-30" />
        </div>
      )}
      <motion.div
        className="w-fit pl-2 mb-1"
        initial={false}
        animate={{
          borderLeftWidth: '4px',
          borderLeftColor: label === timePeriodLabel ? '#8D895E' : '#F1EBDD',
        }}
        transition={{ duration: 0.2 }}
      >
        <p className="text-xs font-medium text-gray-500 mb-0.5">
          {label ? `${label}` : ''}
        </p>
        <div className="flex items-center">
          <p>
            {value ? (
              <>
                <NumberDisplay value={value} /> {unitDisplay(false)}
              </>
            ) : (
              `0 ${unitDisplay(false)}`
            )}
          </p>
        </div>
      </motion.div>

      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          width={500}
          height={300}
          data={volumeData || []}
          onMouseLeave={() => {
            setLabel(timePeriodLabel);
            setValue(volumeOverTimeframe);
          }}
        >
          <YAxis
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickFormatter={(volume: number) =>
              volume === 0 ? '' : `${volume.toFixed(4)}`
            }
            tick={{ fontSize: 12, fill: '#000000', opacity: 0.5 }}
          />
          <XAxis
            dataKey="endTimestamp"
            axisLine={{ stroke: '#000000', strokeWidth: 1 }}
            tickLine={false}
            tickFormatter={(timestamp) =>
              formatXAxisTick(timestamp, activeWindow)
            }
            ticks={getXTicksToShow(volumeData || [], activeWindow)}
            minTickGap={10}
            height={20}
            tick={{ fontSize: 12, fill: '#000000', opacity: 0.5 }}
          />
          <Tooltip
            cursor={{ fill: '#F1EBDD' }}
            content={<CustomTooltip setLabel={setLabel} setValue={setValue} />}
          />
          <Bar dataKey="volume" fill={color} shape={renderCustomBar} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default VolumeChart;
