import { graphqlRequestV2 } from './client/graphqlClient';

/**
 * Protocol-wide analytics, fetched from the v2 `protocol` singleton.
 *
 * Vault analytics deliberately do NOT live here — `fetchVaultStats`
 * (v2, `vault.ts`) backs the vault pages via `vault(address:).statsHistory`.
 * This module only backs the protocol analytics dashboard.
 */

export interface ProtocolAnalyticsStat {
  /** Snapshot time, epoch seconds (live `stats` carries `now`). */
  timestamp: number;
  /** Wei, decimal string. */
  cumulativeVolume: string;
  /** v1 called this `totalTradeCount`. */
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
   * available assets across EVERY configured vault family. Numerically
   * different from v1's client-side `escrowBalance + vaultAvailableAssets`
   * sum, which under-counted by scoping to a single vault family — the
   * difference is intended.
   */
  totalValueLocked: string;
}

export interface ProtocolCategoryOpenInterest {
  /** Keyed by slug — v2 drops the numeric category row id. */
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
// `statsHistory` pages on `pageInfo`: `first` must stay <= the API's
// GRAPHQL_MAX_LIST_SIZE (100) or the request is rejected pre-execution with
// PAGINATION_LIMIT_EXCEEDED. The first page is fetched alongside the singular
// stats/open-interest fields; `GET_PROTOCOL_STATS_HISTORY_PAGE` fetches the
// remaining history pages on their own.
export const GET_PROTOCOL_ANALYTICS = /* GraphQL */ `
  query ProtocolAnalytics($first: Int!, $after: String) {
    protocol {
      stats {
        ...ProtocolStatFields
      }
      statsHistory(first: $first, after: $after) {
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

export const GET_PROTOCOL_STATS_HISTORY_PAGE = /* GraphQL */ `
  query ProtocolStatsHistoryPage($first: Int!, $after: String) {
    protocol {
      statsHistory(first: $first, after: $after) {
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

type ProtocolAnalyticsV2Response = {
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
  data: ProtocolAnalyticsV2Response | null,
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

// Snapshot pages are capped at the API's GRAPHQL_MAX_LIST_SIZE (100). The
// daily series is bounded, so a handful of pages covers all history; MAX_PAGES
// guards against a non-progressing cursor.
const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 50;

export async function fetchProtocolAnalytics(): Promise<ProtocolAnalytics> {
  const data = await graphqlRequestV2<ProtocolAnalyticsV2Response>(
    GET_PROTOCOL_ANALYTICS,
    { first: HISTORY_PAGE_SIZE, after: null }
  );

  const historyNodes: WireStat[] = [
    ...(data?.protocol?.statsHistory?.nodes ?? []),
  ];
  let pageInfo = data?.protocol?.statsHistory?.pageInfo;

  for (let page = 1; page < MAX_HISTORY_PAGES; page += 1) {
    if (!pageInfo?.hasNextPage || !pageInfo.endCursor) break;
    const next = await graphqlRequestV2<{
      protocol: { statsHistory: StatsHistoryPage } | null;
    }>(GET_PROTOCOL_STATS_HISTORY_PAGE, {
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
