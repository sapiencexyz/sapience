import dayjs from 'dayjs';

import type { PriceChartData, VolumeChartData } from '../interfaces/interfaces';
import { TimeWindow } from '../interfaces/interfaces';

export const getXTicksToShow = (
  data: PriceChartData[] | VolumeChartData[],
  activeWindow: TimeWindow
) => {
  if (activeWindow === TimeWindow.W) {
    // For weekly view, show only one tick per day
    const uniqueDays = new Set();
    return data
      .filter((item) => {
        const day = dayjs(item.endTimestamp).startOf('day').valueOf();
        if (!uniqueDays.has(day)) {
          uniqueDays.add(day);
          return true;
        }
        return false;
      })
      .map((item) => item.endTimestamp);
  }
  // For other views, show all ticks
  return undefined;
};

export const formatXAxisTick = (
  timestamp: number,
  activeWindow: TimeWindow
) => {
  const date = dayjs(timestamp);
  if (activeWindow === TimeWindow.D) {
    // For daily or hourly view, return the time
    return date.format('hh:mm A');
  }
  // For other views, return the date
  return date.format('MMM DD');
};
