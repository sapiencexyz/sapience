/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `Query.leaderboard` — unified ranked-account feed across the four
 * leaderboard metrics: ACCURACY, PNL, VOLUME, ROI.
 *
 * ACCURACY rides on the existing scoring service (lifetime time-weighted
 * Brier-derived score; no window filter applies — the score already
 * weights by recency). PNL / VOLUME / ROI ride on the merged
 * account-stats aggregation (see `accountStats.ts`); a `filter.timestamp`
 * window scopes the aggregation to a time range.
 *
 * `AccountRankingConnection.metric` carries the queried metric so the
 * polymorphic `value: String!` on each row can be interpreted client-side
 * (signed wUSDe wei for PNL, positive wUSDe wei for VOLUME, ratio for
 * ROI, raw Brier-derived score for ACCURACY).
 *
 * `rankedAccountsForMetric` is exported so `Account.rank` reuses the same
 * full ordered set rather than scanning a paginated slice.
 */
import type { QueryResolvers } from '../../__generated__/resolvers';
import {
  AccountStatsMetric,
  LeaderboardMetric,
} from '../../__generated__/resolvers';
import { encodeCursor, decodeCursor } from '../../../relay/cursor';
import { synthesizeAccount } from '../accountSynthesis';
import { clampTake } from './pagination';
import {
  getMerged,
  rankedFor,
  resolveWindow,
  type AccountStatsLeaderboardEntry,
} from './accountStats';
import { getLeaderboardScores } from './score';

const metricToLegacy = (metric: LeaderboardMetric): AccountStatsMetric => {
  switch (metric) {
    case LeaderboardMetric.Volume:
      return AccountStatsMetric.Volume;
    case LeaderboardMetric.Pnl:
    case LeaderboardMetric.Roi:
    default:
      return AccountStatsMetric.NetPnl;
  }
};

const valueForMetric = (
  entry: AccountStatsLeaderboardEntry,
  metric: LeaderboardMetric
): string => {
  // Unit polymorphism is intentional: PNL is signed wUSDe, VOLUME is positive
  // wUSDe, ROI is a ratio, and ACCURACY is the raw Brier-derived score.
  if (metric === LeaderboardMetric.Volume) return entry.volume;
  if (metric === LeaderboardMetric.Roi) {
    const volume = Number(BigInt(entry.volume || '0'));
    if (!Number.isFinite(volume) || volume === 0) return '0';
    return String(Number(BigInt(entry.netPnL || '0')) / volume);
  }
  return entry.netPnL;
};

const numericMetricValue = (
  entry: AccountStatsLeaderboardEntry,
  metric: LeaderboardMetric
): number => {
  if (metric === LeaderboardMetric.Volume)
    return Number(BigInt(entry.volume || '0'));
  if (metric === LeaderboardMetric.Roi) {
    const volume = Number(BigInt(entry.volume || '0'));
    if (!Number.isFinite(volume) || volume === 0) return 0;
    return Number(BigInt(entry.netPnL || '0')) / volume;
  }
  return Number(BigInt(entry.netPnL || '0'));
};

type WindowFilter = { from?: number | null; to?: number | null } | null;

/**
 * Translate the SDL `LeaderboardFilter.timestamp` operator-pattern shape
 * to the legacy `{ from, to }` window. `gte`/`lte` map directly; other
 * operators reject so callers don't silently get the full-history
 * aggregation when they pass `equals` / `in`. ACCURACY ignores the window
 * (lifetime aggregate); we still validate operator shape so a future
 * window-aware accuracy backing behaves consistently.
 */
const SUPPORTED_TIMESTAMP_OPS = new Set(['gte', 'lte']);

const projectTimestampWindow = (raw: unknown): WindowFilter => {
  if (raw == null) return null;
  if (typeof raw !== 'object') {
    throw new Error(
      'leaderboard: filter.timestamp must be an IntFilter-shaped object'
    );
  }
  const filter = raw as Record<string, unknown>;
  for (const key of Object.keys(filter)) {
    if (filter[key] == null) continue;
    if (!SUPPORTED_TIMESTAMP_OPS.has(key)) {
      throw new Error(
        `leaderboard: filter.timestamp.${key} is not supported — use gte / lte`
      );
    }
  }
  return {
    from: typeof filter.gte === 'number' ? (filter.gte as number) : null,
    to: typeof filter.lte === 'number' ? (filter.lte as number) : null,
  };
};

export const rankedAccountsForMetric = async (
  metric: LeaderboardMetric,
  filter?: unknown
): Promise<{ address: string; value: string }[]> => {
  const window = projectTimestampWindow(
    (filter as { timestamp?: unknown } | null | undefined)?.timestamp ?? null
  );
  if (metric === LeaderboardMetric.Accuracy) {
    return (await getLeaderboardScores()).map((s) => ({
      address: s.attester,
      value: String(s.accuracyScore),
    }));
  }
  const { fromEpoch, toEpochResolved } = resolveWindow(
    window?.from ?? null,
    window?.to ?? null
  );
  const entries = await getMerged(fromEpoch, toEpochResolved);
  if (metric === LeaderboardMetric.Roi) {
    return [...entries]
      .sort(
        (a, b) => numericMetricValue(b, metric) - numericMetricValue(a, metric)
      )
      .map((entry) => ({
        address: entry.address,
        value: valueForMetric(entry, metric),
      }));
  }
  return rankedFor(entries, metricToLegacy(metric)).map((entry) => ({
    address: entry.address,
    value: valueForMetric(entry, metric),
  }));
};

export const leaderboard = (async (
  _parent: unknown,
  { metric, first, after, filter }: any
) => {
  const cappedFirst = clampTake(first ?? 25, { defaultTake: 25, maxTake: 100 });
  const offsetPayload = after ? decodeCursor(after) : null;
  const start =
    offsetPayload && /^\d+$/.test(offsetPayload.k)
      ? Number(offsetPayload.k) + 1
      : 0;

  const ranked = await rankedAccountsForMetric(metric, filter);

  const slice = ranked.slice(start, start + cappedFirst);
  const nodes = slice.map((e, index) => ({
    account: synthesizeAccount(e.address) as never,
    rank: start + index + 1,
    value: e.value,
  }));
  const edges = nodes.map((node, index) => ({
    node,
    cursor: encodeCursor({
      k: String(start + index),
      id: (node.account as { address: string }).address,
    }),
  }));
  return {
    metric,
    nodes,
    edges,
    pageInfo: {
      hasNextPage: start + slice.length < ranked.length,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
}) as any as NonNullable<QueryResolvers['leaderboard']>;
