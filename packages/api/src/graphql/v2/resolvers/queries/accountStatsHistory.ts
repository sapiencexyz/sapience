/**
 * Per-account, time-bucketed activity series backing `Account.statsHistory`.
 *
 * Reuses the endpoint-agnostic SQL helpers in `services/timeSeriesQueries`
 * (the same source the v1 `accountBalance` / `accountPnl` / `accountVolume` /
 * `accountPredictionCount` queries read) and merges their per-bucket rows
 * — which share an identical `generate_series` grid — into one snapshot per
 * bucket. There is no snapshot table: the series is computed live from escrow
 * predictions, legacy positions, claims, closes, and secondary trades.
 *
 * Monetary values arrive as Postgres DECIMAL text. Deployed / claimable /
 * volume are integer-wei sums; PnL carries a proportional cost-basis division
 * that can yield sub-wei fractions, so every amount is truncated toward zero
 * onto integer wei for the `BigInt` wire scalar.
 */

import {
  queryAccountBalance,
  queryAccountPnl,
  queryAccountPredictionCount,
  queryAccountVolume,
} from '../../../../services/timeSeriesQueries';
import { TimeInterval } from '../../../../services/timeSeriesTypes';

export type AccountStatPointRow = {
  timestamp: number;
  deployedCollateral: bigint;
  claimableCollateral: bigint;
  volume: bigint;
  realizedPnl: bigint;
  cumulativePnl: bigint;
  predictionsTotal: number;
  predictionsWon: number;
  predictionsLost: number;
  predictionsPending: number;
  predictionsNonDecisive: number;
};

// Truncate a Postgres DECIMAL text value toward zero to integer wei. Empty /
// malformed payloads collapse to 0n. Sub-wei fractions (from the PnL
// cost-basis division) are dropped — wei is the atomic unit, so this is lossless
// in practice.
export const decimalTextToWei = (value: string | null | undefined): bigint => {
  if (!value) return 0n;
  const trimmed = value.trim();
  const dot = trimmed.indexOf('.');
  const intPart = dot === -1 ? trimmed : trimmed.slice(0, dot);
  if (intPart === '' || intPart === '-' || intPart === '+') return 0n;
  try {
    return BigInt(intPart);
  } catch {
    return 0n;
  }
};

const SERVICE_INTERVALS: Record<string, TimeInterval> = {
  HOUR: TimeInterval.HOUR,
  DAY: TimeInterval.DAY,
  WEEK: TimeInterval.WEEK,
  MONTH: TimeInterval.MONTH,
};

export const toServiceInterval = (interval: string): TimeInterval =>
  SERVICE_INTERVALS[interval] ?? TimeInterval.DAY;

const emptyRow = (timestamp: number): AccountStatPointRow => ({
  timestamp,
  deployedCollateral: 0n,
  claimableCollateral: 0n,
  volume: 0n,
  realizedPnl: 0n,
  cumulativePnl: 0n,
  predictionsTotal: 0,
  predictionsWon: 0,
  predictionsLost: 0,
  predictionsPending: 0,
  predictionsNonDecisive: 0,
});

export const getAccountStatsHistory = async ({
  address,
  interval,
  from,
  to,
}: {
  address: string;
  interval: string;
  from?: Date;
  to?: Date;
}): Promise<AccountStatPointRow[]> => {
  const svcInterval = toServiceInterval(interval);
  const [balance, pnl, volume, counts] = await Promise.all([
    queryAccountBalance(address, svcInterval, from, to),
    queryAccountPnl(address, svcInterval, from, to),
    queryAccountVolume(address, svcInterval, from, to),
    queryAccountPredictionCount(address, svcInterval, from, to),
  ]);

  // All four series share the same generate_series bucket grid, so a
  // timestamp-keyed merge lines them up one row per bucket. Union the keys
  // defensively in case any leg returns a sparser set.
  const byTimestamp = new Map<number, AccountStatPointRow>();
  const ensure = (timestamp: number): AccountStatPointRow => {
    let row = byTimestamp.get(timestamp);
    if (!row) {
      row = emptyRow(timestamp);
      byTimestamp.set(timestamp, row);
    }
    return row;
  };

  for (const point of balance) {
    const row = ensure(point.timestamp);
    row.deployedCollateral = decimalTextToWei(point.deployedCollateral);
    row.claimableCollateral = decimalTextToWei(point.claimableCollateral);
  }
  for (const point of pnl) {
    const row = ensure(point.timestamp);
    row.realizedPnl = decimalTextToWei(point.pnl);
    row.cumulativePnl = decimalTextToWei(point.cumulativePnl);
  }
  for (const point of volume) {
    ensure(point.timestamp).volume = decimalTextToWei(point.volume);
  }
  for (const point of counts) {
    const row = ensure(point.timestamp);
    row.predictionsTotal = point.total;
    row.predictionsWon = point.won;
    row.predictionsLost = point.lost;
    row.predictionsPending = point.pending;
    row.predictionsNonDecisive = point.nonDecisive;
  }

  return Array.from(byTimestamp.values()).sort(
    (a, b) => a.timestamp - b.timestamp
  );
};
