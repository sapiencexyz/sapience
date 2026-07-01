import { graphqlRequest } from './client/graphqlClient';

/**
 * Protocol-wide analytics, fetched from the `protocol` singleton.
 *
 * Vault analytics deliberately do NOT live here — `fetchVaultStats`
 * (`vault.ts`) backs the vault pages via `vault(address:).statsHistory`.
 * This module only backs the protocol analytics dashboard.
 */

export interface ProtocolAnalyticsStat {
  /** Snapshot time, epoch seconds (live `stats` carries `now`). */
  timestamp: number;
  /** Wei, decimal string. */
  cumulativeVolume: string;
  /** Cumulative count of trades. */
  cumulativeTradeCount: number;
  /** Wei, decimal string. */
  periodVolume: string;
  periodTradeCount: number;
  /** Wei, decimal string. */
  openInterest: string;
  /** Wei, decimal string. */
  escrowBalance: string;
  /**
   * Server-computed protocol TVL, wei: escrow collateral + undeployed
   * available assets across EVERY configured vault family.
   */
  totalValueLocked: string;
}

export interface ProtocolCategoryOpenInterest {
  /** Keyed by slug — there is no numeric category row id. */
  category: { name: string; slug: string };
  /** Open interest in wei (decimal string). */
  openInterest: string;
}

/**
 * Open interest bucketed by time-to-resolution. The window is
 * `(minSecondsFromNow, maxSecondsFromNow]` — left-exclusive,
 * right-inclusive. Do not re-derive labels with `[min, max)`.
 */
export interface ProtocolTimeToResolutionBucket {
  /** Exclusive lower bound (seconds from now); null on the first bucket. */
  minSecondsFromNow: number | null;
  /** Inclusive upper bound (seconds from now); null on the tail bucket. */
  maxSecondsFromNow: number | null;
  /** Open interest in wei (decimal string). */
  openInterest: string;
  predictionCount: number;
}

export interface ProtocolAnalytics {
  /** Live stats (timestamp = now), including read-time TVL. */
  stats: ProtocolAnalyticsStat;
  /** Recorded snapshots, oldest first. */
  statsHistory: ProtocolAnalyticsStat[];
  openInterestByCategory: ProtocolCategoryOpenInterest[];
  openInterestByTimeToResolution: ProtocolTimeToResolutionBucket[];
}

const PROTOCOL_STAT_FIELDS = /* GraphQL */ `
  fragment ProtocolStatFields on ProtocolStat {
    timestamp
    cumulativeVolume
    cumulativeTradeCount
    periodVolume
    periodTradeCount
    openInterest
    escrowBalance
    totalValueLocked
  }
`;

// `Protocol.statsHistory` exposes no orderBy argument — the connection is
// defined oldest-first in the SDL; the mapper still sorts defensively.
//
// We request `interval: DAY` so the server downsamples the (sub-daily, ~4-hourly
// in prod) snapshot series to one node per day — exactly what the charts render
// — instead of returning thousands of raw rows. `first` is left null so the
// server returns the whole bucketed series in one page (it ignores the
// GRAPHQL_MAX_LIST_SIZE 25 cap only because no explicit `first` value is sent);
// the daily series fits comfortably under the resolver's internal page cap.
// `GET_PROTOCOL_STATS_HISTORY_PAGE` remains as a forward-pagination safety net
// for the rare case the series ever exceeds one page.
export const GET_PROTOCOL_ANALYTICS = /* GraphQL */ `
  query ProtocolAnalytics(
    $interval: TimeInterval
    $first: Int
    $after: String
  ) {
    protocol {
      stats {
        ...ProtocolStatFields
      }
      statsHistory(interval: $interval, first: $first, after: $after) {
        nodes {
          ...ProtocolStatFields
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
      openInterestByCategory {
        category {
          name
          slug
        }
        openInterest
      }
      openInterestByTimeToResolution {
        minSecondsFromNow
        maxSecondsFromNow
        openInterest
        predictionCount
      }
    }
  }

  ${PROTOCOL_STAT_FIELDS}
`;

export const GET_PROTOCOL_STATS = /* GraphQL */ `
  query ProtocolStats {
    protocol {
      stats {
        ...ProtocolStatFields
      }
    }
  }

  ${PROTOCOL_STAT_FIELDS}
`;

export const GET_PROTOCOL_STATS_HISTORY_PAGE = /* GraphQL */ `
  query ProtocolStatsHistoryPage(
    $interval: TimeInterval
    $first: Int
    $after: String
  ) {
    protocol {
      statsHistory(interval: $interval, first: $first, after: $after) {
        nodes {
          ...ProtocolStatFields
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }

  ${PROTOCOL_STAT_FIELDS}
`;

type WireStat = {
  timestamp: number;
  cumulativeVolume: string | number;
  cumulativeTradeCount: number;
  periodVolume: string | number;
  periodTradeCount: number;
  openInterest: string | number;
  escrowBalance: string | number;
  totalValueLocked: string | number;
};

type StatsHistoryPage = {
  nodes: WireStat[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

type ProtocolAnalyticsResponse = {
  protocol: {
    stats: WireStat;
    statsHistory: StatsHistoryPage;
    openInterestByCategory: Array<{
      category: { name: string; slug: string };
      openInterest: string | number;
    }>;
    openInterestByTimeToResolution: Array<{
      minSecondsFromNow: number | null;
      maxSecondsFromNow: number | null;
      openInterest: string | number;
      predictionCount: number;
    }>;
  };
};

// The BigInt scalar can serialize as string or number depending on the
// transport; normalize to decimal strings so consumers can BigInt() them.
const wei = (value: string | number): string => String(value);

function toStat(node: WireStat): ProtocolAnalyticsStat {
  return {
    timestamp: node.timestamp,
    cumulativeVolume: wei(node.cumulativeVolume),
    cumulativeTradeCount: node.cumulativeTradeCount,
    periodVolume: wei(node.periodVolume),
    periodTradeCount: node.periodTradeCount,
    openInterest: wei(node.openInterest),
    escrowBalance: wei(node.escrowBalance),
    totalValueLocked: wei(node.totalValueLocked),
  };
}

function toProtocolAnalytics(
  data: ProtocolAnalyticsResponse | null,
  historyNodes: WireStat[]
): ProtocolAnalytics {
  const protocol = data?.protocol;
  if (
    !protocol ||
    !protocol.stats ||
    !Array.isArray(protocol.statsHistory?.nodes) ||
    !Array.isArray(protocol.openInterestByCategory) ||
    !Array.isArray(protocol.openInterestByTimeToResolution)
  ) {
    throw new Error(
      'Failed to fetch protocol analytics: Invalid response structure'
    );
  }

  return {
    stats: toStat(protocol.stats),
    statsHistory: historyNodes
      .map(toStat)
      .sort((a, b) => a.timestamp - b.timestamp),
    openInterestByCategory: protocol.openInterestByCategory.map((row) => ({
      category: { name: row.category.name, slug: row.category.slug },
      openInterest: wei(row.openInterest),
    })),
    openInterestByTimeToResolution: protocol.openInterestByTimeToResolution
      .map((row) => ({
        minSecondsFromNow: row.minSecondsFromNow,
        maxSecondsFromNow: row.maxSecondsFromNow,
        openInterest: wei(row.openInterest),
        predictionCount: row.predictionCount,
      }))
      // Ascending by upper bound, open-ended tail (null max) last.
      .sort(
        (a, b) =>
          (a.maxSecondsFromNow ?? Number.POSITIVE_INFINITY) -
          (b.maxSecondsFromNow ?? Number.POSITIVE_INFINITY)
      ),
  };
}

// Daily bucketing keeps the series to ~one node per day, so the whole history
// comes back in the first page. `first: null` lets the server return the full
// bucketed series without tripping the GRAPHQL_MAX_LIST_SIZE (25) pre-execution
// cap (which only inspects explicit `first` values). The pagination loop below
// is a safety net — normally it never iterates — with MAX_PAGES guarding against
// a non-progressing cursor.
const HISTORY_INTERVAL = 'DAY';
const HISTORY_PAGE_SIZE = null;
const MAX_HISTORY_PAGES = 50;

export async function fetchProtocolStats(): Promise<ProtocolAnalyticsStat> {
  const data = await graphqlRequest<{
    protocol: { stats: WireStat } | null;
  }>(GET_PROTOCOL_STATS);
  const stats = data?.protocol?.stats;
  if (!stats) {
    throw new Error(
      'Failed to fetch protocol stats: Invalid response structure'
    );
  }
  return toStat(stats);
}

export async function fetchProtocolAnalytics(): Promise<ProtocolAnalytics> {
  const data = await graphqlRequest<ProtocolAnalyticsResponse>(
    GET_PROTOCOL_ANALYTICS,
    { interval: HISTORY_INTERVAL, first: HISTORY_PAGE_SIZE, after: null }
  );

  const historyNodes: WireStat[] = [
    ...(data?.protocol?.statsHistory?.nodes ?? []),
  ];
  let pageInfo = data?.protocol?.statsHistory?.pageInfo;

  for (let page = 1; page < MAX_HISTORY_PAGES; page += 1) {
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    const next = await graphqlRequest<{
      protocol: { statsHistory: StatsHistoryPage } | null;
    }>(GET_PROTOCOL_STATS_HISTORY_PAGE, {
      interval: HISTORY_INTERVAL,
      first: HISTORY_PAGE_SIZE,
      after: pageInfo.endCursor,
    });
    const history = next?.protocol?.statsHistory;
    if (!history || !Array.isArray(history.nodes)) break;
    historyNodes.push(...history.nodes);
    pageInfo = history.pageInfo;
  }

  return toProtocolAnalytics(data, historyNodes);
}
