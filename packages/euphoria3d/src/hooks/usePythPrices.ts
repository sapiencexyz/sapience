import { useEffect, useRef, useState } from 'react';
import { PYTH_FEED_HERMES_MAP } from '@sapience/sdk/constants';
import type { SelectedFeed } from '../components/TickerPicker';
import { ROUND_SECONDS } from '../lib/envConfig';

export interface PricePoint {
  leg1: number;
  leg2: number;
  leg3: number;
  timestamp: number;
}

const MAX_POINTS = 200;

async function fetchLatestPrice(hermesId: string, signal: AbortSignal): Promise<number | null> {
  try {
    const resp = await fetch(
      `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${hermesId}&parsed=true`,
      { signal },
    );
    if (!resp.ok) return null;
    const data = (await resp.json()) as {
      parsed?: { price: { price: string; expo: number } }[];
    };
    const entry = data?.parsed?.[0];
    if (!entry) return null;
    return Number(entry.price.price) * Math.pow(10, entry.price.expo);
  } catch {
    return null;
  }
}

export function usePythPrices(
  leg1: SelectedFeed | null,
  leg2: SelectedFeed | null,
  leg3: SelectedFeed | null,
) {
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [latestLeg1, setLatestLeg1] = useState<number | null>(null);
  const [latestLeg2, setLatestLeg2] = useState<number | null>(null);
  const [latestLeg3, setLatestLeg3] = useState<number | null>(null);
  const [frameId, setFrameId] = useState(0);
  const prevFeedsRef = useRef<string>('');

  // Reset when feeds change
  const feedKey = `${leg1?.id ?? ''}:${leg2?.id ?? ''}:${leg3?.id ?? ''}`;
  useEffect(() => {
    if (prevFeedsRef.current !== feedKey) {
      prevFeedsRef.current = feedKey;
      setPoints([]);
      setLatestLeg1(null);
      setLatestLeg2(null);
      setLatestLeg3(null);
    }
  }, [feedKey]);

  useEffect(() => {
    if (!leg1 || !leg2 || !leg3) return;

    const hermesId1 = PYTH_FEED_HERMES_MAP[leg1.id];
    const hermesId2 = PYTH_FEED_HERMES_MAP[leg2.id];
    const hermesId3 = PYTH_FEED_HERMES_MAP[leg3.id];
    if (!hermesId1 || !hermesId2 || !hermesId3) {
      console.warn('[usePythPrices] Missing Hermes ID for feed(s):',
        !hermesId1 && `leg1=${leg1.id}`,
        !hermesId2 && `leg2=${leg2.id}`,
        !hermesId3 && `leg3=${leg3.id}`,
        '— only featured feeds (BTC, ETH, ENA, OIL, GOLD, SPY, TSLA) have Hermes mappings');
      return;
    }

    const ac = new AbortController();

    async function poll() {
      const [p1, p2, p3] = await Promise.all([
        fetchLatestPrice(hermesId1, ac.signal),
        fetchLatestPrice(hermesId2, ac.signal),
        fetchLatestPrice(hermesId3, ac.signal),
      ]);
      if (ac.signal.aborted) return;
      if (p1 !== null && p2 !== null && p3 !== null) {
        const point: PricePoint = { leg1: p1, leg2: p2, leg3: p3, timestamp: Date.now() };
        setLatestLeg1(p1);
        setLatestLeg2(p2);
        setLatestLeg3(p3);
        setPoints((prev) => {
          const next = [...prev, point];
          return next.length > MAX_POINTS ? next.slice(-MAX_POINTS) : next;
        });
        setFrameId((prev) => prev + 1);
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), ROUND_SECONDS * 1000);

    return () => {
      ac.abort();
      clearInterval(interval);
    };
  }, [leg1, leg2, leg3]);

  return { points, latestLeg1, latestLeg2, latestLeg3, frameId };
}
