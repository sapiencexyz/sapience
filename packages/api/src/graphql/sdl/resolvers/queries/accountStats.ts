/**
 * `accountStatsLeaderboard` — addresses ranked by a chosen account metric
 * over an optional date range.
 *
 * Metrics: NET_PNL / GAINS / LOSSES (from `calculateAccountPnLBreakdown`,
 * attributed to settlement time) and VOLUME (from `calculateAccountVolumes`,
 * attributed to trade time). Both aggregations for a given window are
 * merged by address and held in a short TTL cache; ranking and pagination
 * are trivial array ops once cached.
 *
 * `from` omitted ⇒ all-time (no lower bound). `to` omitted ⇒ now.
 */
import type { QueryResolvers } from '../../__generated__/resolvers';
import { AccountStatMetric } from '../../__generated__/resolvers';
import { TtlCache } from '../../../../lib/ttlCache';
import {
  calculateAccountPnLBreakdown,
  calculateAccountVolumes,
} from '../../../../services/accountStats';

interface AccountStatEntry {
  address: string;
  netPnL: string;
  gains: string;
  losses: string;
  volume: string;
}

const cache = new TtlCache<string, AccountStatEntry[]>({
  ttlMs: 60_000,
  maxSize: 50,
});

/** Numeric value (in ether units) for ranking; precision loss is fine for sort order. */
const num = (wei: string): number => {
  const v = parseFloat(wei) / 1e18;
  return Number.isFinite(v) ? v : 0;
};

const getMerged = async (
  fromEpoch: number | undefined,
  toEpoch: number
): Promise<AccountStatEntry[]> => {
  const key = `${fromEpoch ?? 'all'}:${toEpoch}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const [pnl, volume] = await Promise.all([
    calculateAccountPnLBreakdown({ fromEpoch, toEpoch }),
    calculateAccountVolumes({ fromEpoch, toEpoch }),
  ]);

  const byAddress = new Map<string, AccountStatEntry>();
  const entryFor = (address: string): AccountStatEntry => {
    const addr = address.toLowerCase();
    let e = byAddress.get(addr);
    if (!e) {
      e = { address: addr, netPnL: '0', gains: '0', losses: '0', volume: '0' };
      byAddress.set(addr, e);
    }
    return e;
  };
  for (const r of pnl) {
    const e = entryFor(r.address);
    e.netPnL = r.netPnL;
    e.gains = r.gains;
    e.losses = r.losses;
  }
  for (const r of volume) {
    entryFor(r.address).volume = r.volume;
  }

  const merged = Array.from(byAddress.values());
  cache.set(key, merged);
  return merged;
};

/** Snap epoch seconds down to the minute so the cache key isn't unique per request. */
const floorToMinute = (epochSeconds: number): number =>
  Math.floor(epochSeconds / 60) * 60;

export const accountStatsLeaderboard: NonNullable<
  QueryResolvers['accountStatsLeaderboard']
> = async (_parent, { metric, from, to, limit, skip }) => {
  const toDate = to ?? new Date();
  const toEpoch = floorToMinute(Math.floor(toDate.getTime() / 1000));
  const fromEpoch =
    from != null ? floorToMinute(Math.floor(from.getTime() / 1000)) : undefined;

  const entries = await getMerged(fromEpoch, toEpoch);

  const ranked = [...entries].sort((a, b) => {
    switch (metric) {
      case AccountStatMetric.Gains:
        return num(b.gains) - num(a.gains);
      case AccountStatMetric.Losses:
        // Biggest losses first ⇒ most negative first.
        return num(a.losses) - num(b.losses);
      case AccountStatMetric.Volume:
        return num(b.volume) - num(a.volume);
      case AccountStatMetric.NetPnl:
      default:
        return num(b.netPnL) - num(a.netPnL);
    }
  });

  const cappedLimit = Math.max(1, Math.min(limit, 100));
  return ranked.slice(skip, skip + cappedLimit);
};
