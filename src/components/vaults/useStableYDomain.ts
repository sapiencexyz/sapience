'use client';

import { useRef } from 'react';

export type YDomain = [number, number];

/**
 * Keeps a chart's y-domain from rescaling while its series streams in.
 *
 * `fetchVaultStats` walks pages newest-first and pushes each partial into the
 * query cache, so the series grows leftward across several renders. Recomputing
 * the domain from each partial makes every existing point jump vertically — the
 * line "bounces" into a new shape instead of simply extending.
 *
 * Returning the union of the previous domain and the newly computed one fixes
 * that: points only ever move when a genuinely new extreme arrives. Because the
 * series only grows (never loses points), the union converges on exactly the
 * domain a single computation over the complete series would produce.
 *
 * `resetKey` clears the latch when the series is replaced rather than extended
 * (switching vault, period, or display mode).
 */
export function useStableYDomain(domain: YDomain, resetKey: string): YDomain {
  const latched = useRef<{ key: string; domain: YDomain } | null>(null);

  if (!latched.current || latched.current.key !== resetKey) {
    latched.current = { key: resetKey, domain };
    return domain;
  }

  const [prevMin, prevMax] = latched.current.domain;
  const [nextMin, nextMax] = domain;
  const merged: YDomain = [
    Math.min(prevMin, nextMin),
    Math.max(prevMax, nextMax),
  ];

  if (merged[0] !== prevMin || merged[1] !== prevMax) {
    latched.current = { key: resetKey, domain: merged };
  }
  return latched.current.domain;
}
