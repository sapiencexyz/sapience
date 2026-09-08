'use client';

import { useRef } from 'react';

/**
 * Gates a chart's `isAnimationActive` so a series reveals once and then
 * extends silently.
 *
 * Recharts tweens an updated series *by index*: point `i` of the previous
 * render animates to point `i` of the next one. Anything that shifts indices
 * or rewrites the tail therefore morphs the whole path rather than just
 * changing what it appends — live WS share quotes rewrite the trailing point
 * every tick, and the 60s interval refetch appends new snapshots.
 *
 * Animating only the first painted render of a given series keeps the reveal
 * while making every later update a plain re-layout, so nothing tweens
 * through intermediate y values.
 *
 * `resetKey` re-arms the reveal when the series is genuinely replaced
 * (switching vault, period, or display mode) rather than extended. Pair with
 * {@link useStableYDomain}, which keeps the axis itself from rescaling.
 */
export function useSeriesRevealAnimation(
  resetKey: string,
  hasData: boolean
): boolean {
  const revealed = useRef<string | null>(null);

  // Renders before the first point paint nothing, so they must not spend the
  // reveal — otherwise the series pops in with no animation at all.
  if (!hasData) {
    revealed.current = null;
    return true;
  }

  if (revealed.current !== resetKey) {
    revealed.current = resetKey;
    return true;
  }
  return false;
}
