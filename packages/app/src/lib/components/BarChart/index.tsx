import { Box, Flex, Text } from '@chakra-ui/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import {
  type Dispatch,
  type SetStateAction,
  type ReactNode,
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

import { VolumeWindow } from '~/lib/interfaces/interfaces';
import { formatAmount } from '~/lib/util/numberUtil';

dayjs.extend(utc);

export type LineChartProps = {
  data: any[];
  color?: string | undefined;
  height?: number | undefined;
  activeWindow?: VolumeWindow;
} & React.HTMLAttributes<HTMLDivElement>;

interface CustomTooltipProps {
  setValue: Dispatch<SetStateAction<number | undefined>>; // used for value on hover
  setLabel: Dispatch<SetStateAction<string | undefined>>; // used for label of value
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
  if (!payload || !payload[0]) return null;
  const fee = payload?.[0]?.payload?.fee;
  const timestamp = payload[0].payload.timestamp * 1000;

  setValue(payload[0].value || 0);
  setLabel(dayjs(timestamp).format('MMM D, YYYY, h:mm A'));
  if (!fee) return null;
  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: '8px',
        border: '1px solid #ccc',
      }}
    >
      <p className="intro">{`Fee: ${fee}`}</p>
    </div>
  );
};

const Chart = ({ data, color = '#56B2A4', activeWindow }: LineChartProps) => {
  const [value, setValue] = useState<number | undefined>();
  const [label, setLabel] = useState<string | undefined>();

  const renderCustomBar = (props: any) => {
    const { x, y, width, height } = props;
    return <CustomBar x={x} y={y} width={width} height={height} fill={color} />;
  };

  return (
    <Flex flex={1} position="relative">
      <Box
        minH="50px"
        w="fit-content"
        position="absolute"
        top={0}
        left={0}
        zIndex={2}
        bgColor="white"
        opacity={0.8}
      >
        <Text> {value ? `${value.toLocaleString()}` : ''}</Text>
        <Text> {label ? `${label}` : ''}</Text>
      </Box>

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
            if (setLabel) setLabel(undefined);
            if (setValue) setValue(undefined);
          }}
        >
          <YAxis
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickFormatter={(price) =>
              price === 0 ? '' : `${formatAmount(price)}`
            }
          />
          <XAxis
            dataKey="timestamp"
            axisLine={false}
            tickLine={false}
            tickFormatter={(time) => {
              const date = dayjs(time * 1000);
              return activeWindow === VolumeWindow.D ||
                activeWindow === VolumeWindow.H
                ? date.format('hh:mm A')
                : date.format('MMM DD');
            }}
            minTickGap={10}
          />
          <Tooltip
            contentStyle={{}}
            content={<CustomTooltip setLabel={setLabel} setValue={setValue} />}
          />
          <Bar dataKey="value" fill={color} shape={renderCustomBar} />
        </BarChart>
      </ResponsiveContainer>
    </Flex>
  );
};

export default Chart;
