'use client';

import { useEffect, useRef, useState } from 'react';
import { getRpcUrl, DEFAULT_CHAIN_ID } from '~/lib/sdk/constants';
import { useAnimatedNumber } from '~/hooks/useAnimatedNumber';
import { useSettings } from '~/lib/context/SettingsContext';

const PING_INTERVAL_MS = 10_000;

export function useRpcPing() {
  const [rawMs, setRawMs] = useState<number | null>(null);
  // Ping whatever RPC the user entered in Settings; fall back to the active
  // chain's built-in RPC when no custom RPC is configured (or pre-mount).
  const { customRpcURL } = useSettings();
  const rpcUrl = customRpcURL || getRpcUrl(DEFAULT_CHAIN_ID);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );

  useEffect(() => {
    async function measure() {
      if (document.hidden) return;
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

    function handleVisibilityChange() {
      if (!document.hidden) measure();
    }

    measure();
    intervalRef.current = setInterval(measure, PING_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [rpcUrl]);

  const animated = useAnimatedNumber(rawMs);
  return animated !== null ? Math.round(animated) : null;
}
