import { useState, useEffect } from 'react';

/** Re-render on an interval (default every second) so time-derived render
 *  output — countdowns, "5 minutes ago" labels — stays fresh while the page
 *  sits open. Returns the current epoch ms, or null before the first tick. */
export function useSecondTick(intervalMs = 1000) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);

  return nowMs;
}
