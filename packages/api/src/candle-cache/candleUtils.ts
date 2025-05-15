export function startOfInterval(timestamp: number, interval: number): number {
  return Math.floor(timestamp / interval) * interval;
}

export function getTimtestampCandleInterval(
  timestamp: number,
  interval: number
): {
  start: number;
  end: number;
} {
  return {
    start: startOfInterval(timestamp, interval),
    end: startOfNextInterval(timestamp, interval),
  };
}

export function startOfNextInterval(
  timestamp: number,
  interval: number
): number {
  return startOfInterval(timestamp, interval) + interval;
}

export function getTimeWindow(from: number, to: number, interval: number) {
  return {
    from: startOfInterval(from, interval),
    to: startOfNextInterval(to, interval),
  };
}
