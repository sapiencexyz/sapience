'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getRpcUrl, DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

const PING_INTERVAL_MS = 5_000;
const LERP_DURATION_MS = 600;

export function useRpcPing() {
  const [displayMs, setDisplayMs] = useState<number | null>(null);
  const rpcUrl = useMemo(() => getRpcUrl(DEFAULT_CHAIN_ID), []);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  const animRef = useRef<number | undefined>(undefined);
  const fromRef = useRef<number | null>(null);
  const toRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    function animateTo(target: number) {
      const from = fromRef.current ?? target;
      fromRef.current = from;
      toRef.current = target;
      startTimeRef.current = performance.now();

      if (animRef.current) cancelAnimationFrame(animRef.current);

      function step() {
        const elapsed = performance.now() - startTimeRef.current;
        const t = Math.min(elapsed / LERP_DURATION_MS, 1);
        // ease-out cubic
        const eased = 1 - (1 - t) ** 3;
        const current = Math.round(from + (target - from) * eased);
        setDisplayMs(current);

        if (t < 1) {
          animRef.current = requestAnimationFrame(step);
        } else {
          fromRef.current = target;
          animRef.current = undefined;
        }
      }

      animRef.current = requestAnimationFrame(step);
    }

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
        const ms = Math.round(performance.now() - start);
        animateTo(ms);
      } catch {
        setDisplayMs(null);
        fromRef.current = null;
        toRef.current = null;
      }
    }

    measure();
    intervalRef.current = setInterval(measure, PING_INTERVAL_MS);
    return () => {
      clearInterval(intervalRef.current);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [rpcUrl]);

  return displayMs;
}
