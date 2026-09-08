import type { VaultStat } from '~/lib/sdk/queries';
import { PERIOD_DAYS, type Period } from '~/components/shared/PeriodFilter';

const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

export type VaultSharePricePoint = {
  timestamp: number;
  price: number;
};

/**
 * Build the share-price series from the vault's snapshot history.
 *
 * `sharePrice` is null for every snapshot predating the feature (MTM quotes
 * are live-only and were never backfilled) and for snapshots taken while the
 * vault-quoter was unreachable — those rows are dropped rather than plotted
 * as gaps, so the visible line starts at the first captured quote.
 *
 * `livePrice` (the relayer's current WS quote, when available) is appended as
 * a point stamped at `nowSec`, so the chart is meaningful from day one
 * instead of only after two daily snapshots.
 */
export function buildVaultSharePriceChartData(
  vaultStats: VaultStat[] | undefined,
  period: Period,
  nowSec = Math.floor(Date.now() / 1000),
  anchorSec?: number,
  livePrice?: number
): VaultSharePricePoint[] {
  const periodDays = PERIOD_DAYS[period];
  const periodCutoff =
    periodDays === Infinity ? 0 : nowSec - periodDays * ONE_DAY_IN_SECONDS;
  // `anchorSec` is a hard lower bound on visible history (see
  // chartAnchorSecForChain); the period window still applies on top of it.
  const cutoffTimestamp =
    anchorSec !== undefined ? Math.max(periodCutoff, anchorSec) : periodCutoff;

  const points: VaultSharePricePoint[] = (vaultStats ?? [])
    .filter(
      (stat) => stat.sharePrice != null && stat.timestamp >= cutoffTimestamp
    )
    .map((stat) => ({
      timestamp: stat.timestamp,
      price: Number(stat.sharePrice),
    }))
    .filter((point) => Number.isFinite(point.price) && point.price > 0);

  if (
    livePrice !== undefined &&
    Number.isFinite(livePrice) &&
    livePrice > 0 &&
    nowSec >= cutoffTimestamp &&
    (points.length === 0 || nowSec > points[points.length - 1].timestamp)
  ) {
    points.push({ timestamp: nowSec, price: livePrice });
  }

  return points;
}

/**
 * Padded min/max y-domain. Deliberately NOT zero-anchored: the series lives
 * near 1.0, and a zero-based axis would flatten every move into an unreadable
 * horizontal line. A flat series still gets a small band so the line doesn't
 * sit on the chart edge.
 */
export function computeSharePriceYDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal;
  const padding = range * 0.1 || Math.max(Math.abs(maxVal) * 0.005, 0.001);

  return [minVal - padding, maxVal + padding];
}
