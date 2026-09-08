'use client';

import { useRef } from 'react';

export type YDomain = [number, number];

/**
 * Keeps a chart's y-domain from rescaling as its series extends.
 *
 * The share-price chart restamps its trailing point on every live WS quote,
 * and both charts append snapshots on the 60s refetch. Recomputing the domain
 * from each update makes every existing point jump vertically — the line
 * "bounces" into a new shape instead of simply extending.
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
