import { useEffect, useRef, useState } from 'react';
import type { Tier } from '../App';
import {
  fetchProductionPool,
  pickRandom,
  type BingoCondition,
} from '../api';

const MIN_PRICE = 0.1;
const MAX_PRICE = 0.9;
const POOL_SIZE = 64;
const CELL_COUNT = 16;
const MIN_DURATION_MS = 2000;

export interface MintResult {
  conditions: BingoCondition[];
}

export default function MintingScreen({
  tier: _tier,
  onReady,
}: {
  tier: Tier;
  onReady: (result: MintResult) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  // Ensure onReady fires exactly once across StrictMode double-mount.
  const finishedRef = useRef(false);

  useEffect(() => {
    if (finishedRef.current) return;

    const startedAt = Date.now();
    let aborted = false;

    (async () => {
      try {
        const pool = await fetchProductionPool({
          take: POOL_SIZE,
          minEstimatedPrice: MIN_PRICE,
          maxEstimatedPrice: MAX_PRICE,
        });
        if (aborted) return;

        if (pool.length < CELL_COUNT) {
          setError(
            `Only ${pool.length} eligible markets in pool; need ${CELL_COUNT}.`,
          );
          return;
        }

        const conditions = pickRandom(pool, CELL_COUNT);
        const remaining = Math.max(0, MIN_DURATION_MS - (Date.now() - startedAt));
        window.setTimeout(() => {
          if (aborted) return;
          finishedRef.current = true;
          onReady({ conditions });
        }, remaining);
      } catch (e) {
        if (aborted) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Couldn't reach Sapience API: ${msg}`);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [onReady]);

  if (error) {
    return (
      <section className="screen">
        <h2>Mint failed</h2>
        <p className="error">{error}</p>
        <p className="muted small">
          In production, this would trigger a refund.
        </p>
      </section>
    );
  }

  return (
    <section className="screen center-screen">
      <div className="spinner" />
      <p className="muted">Loading…</p>
    </section>
  );
}
