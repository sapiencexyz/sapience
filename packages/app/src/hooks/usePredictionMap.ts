'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Manages a throttled prediction probability map.
 *
 * Quotes can arrive rapidly from the relayer; we keep a live ref (updated on
 * every tick) and a committed state that only re-renders the UI when the
 * displayed integer-percent value changes (every 250ms at most).
 */
export function usePredictionMap() {
  const livePredictionMapRef = useRef<Record<string, number>>({});
  const [predictionMap, setPredictionMap] = useState<Record<string, number>>(
    {}
  );
  const predictionMapRef = useRef<Record<string, number>>(predictionMap);
  predictionMapRef.current = predictionMap;

  const commitTimerRef = useRef<number | null>(null);

  const schedulePredictionCommit = useCallback(() => {
    if (commitTimerRef.current != null) return;
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      setPredictionMap((prev) => {
        let next: Record<string, number> | null = null;
        const live = livePredictionMapRef.current;

        for (const [id, prob] of Object.entries(live)) {
          const prevProb = prev[id];
          if (prevProb == null) {
            next = next ?? { ...prev };
            next[id] = prob;
            continue;
          }
          const prevPct = Math.round(prevProb * 100);
          const nextPct = Math.round(prob * 100);
          if (prevPct !== nextPct) {
            next = next ?? { ...prev };
            next[id] = prob;
          }
        }

        return next ?? prev;
      });
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (commitTimerRef.current != null) {
        window.clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
    };
  }, []);

  const handlePrediction = useCallback(
    (conditionId: string, probability: number) => {
      livePredictionMapRef.current[conditionId] = probability;
      schedulePredictionCommit();
    },
    [schedulePredictionCommit]
  );

  return { predictionMap, predictionMapRef, handlePrediction };
}
