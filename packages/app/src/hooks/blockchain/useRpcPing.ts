'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getRpcUrl, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { useAnimatedNumber } from '~/hooks/useAnimatedNumber';

const PING_INTERVAL_MS = 5_000;

export function useRpcPing() {
  const [rawMs, setRawMs] = useState<number | null>(null);
  const rpcUrl = useMemo(() => getRpcUrl(DEFAULT_CHAIN_ID), []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  useEffect(() => {
    async function measure() {
      const start = performance.now();
      try {
        await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_chainId',
            params: [],
          }),
        });
        setRawMs(Math.round(performance.now() - start));
      } catch {
        setRawMs(null);
      }
    }

    measure();
    intervalRef.current = setInterval(measure, PING_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [rpcUrl]);

  const animated = useAnimatedNumber(rawMs);
  return animated !== null ? Math.round(animated) : null;
}
