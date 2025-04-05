export function maxBigInt(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

export function startOfCurrentInterval(
  timestamp: number,
  interval: number
): number {
  return Math.floor(timestamp / interval) * interval;
}

export function startOfNextInterval(
  timestamp: number,
  interval: number
): number {
  return (Math.floor(timestamp / interval) + 1) * interval;
}

export function getTimeWindow(from: number, to: number, interval: number) {
  return {
    from: startOfCurrentInterval(from, interval),
    to: startOfNextInterval(to, interval),
  };
}
