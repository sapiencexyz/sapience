'use client';

import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 600;

/**
 * Smoothly interpolates a displayed number toward a target value
 * using requestAnimationFrame with an ease-out cubic curve.
 */
export function useAnimatedNumber(
  target: number | null,
  durationMs = DEFAULT_DURATION_MS
): number | null {
  const [display, setDisplay] = useState<number | null>(target);
  const animRef = useRef<number | undefined>(undefined);
  const fromRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (target === null) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      fromRef.current = null;
      setDisplay(null);
      return;
    }

    const from = fromRef.current ?? target;
    fromRef.current = from;
    startTimeRef.current = performance.now();

    if (animRef.current) cancelAnimationFrame(animRef.current);

    function step() {
      const elapsed = performance.now() - startTimeRef.current;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - (1 - t) ** 3;
      const current = from + (target! - from) * eased;
      setDisplay(current);

      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        fromRef.current = target;
        animRef.current = undefined;
      }
    }

    animRef.current = requestAnimationFrame(step);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [target, durationMs]);

  return display;
}
