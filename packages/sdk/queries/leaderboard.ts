import { graphqlRequest } from './client/graphqlClient';

export type AccountStatMetric = 'NET_PNL' | 'GAINS' | 'LOSSES' | 'VOLUME';

/** All amounts are wei strings (18 decimals); `losses` is negative. */
export interface AccountStatEntry {
  address: string;
  netPnL: string;
  gains: string;
  losses: string;
  volume: string;
}

/** Row shape returned by `accuracyLeaderboard`. Slimmed: the 4 hardcoded-zero
 *  fields the resolver used to ship (`numScored`, `numTimeWeighted`,
 *  `sumErrorSquared`, `sumTimeWeightedError`) are no longer surfaced. */
export type ForecasterScore = {
  address: string;
  accuracyScore: number;
};

/** Single-address result from `accountAccuracyRank`. `accuracyScore` is always
 *  a number (zero when unscored); `rank` is null for unscored addresses. */
export interface AccuracyRankResult {
  address: string;
  accuracyScore: number;
  rank: number | null;
  totalForecasters: number;
}

/** Single-address result from `accountStatsRank`. Stats fields are wei strings
 *  always present (zero when no activity in the window); `rank` is null when
 *  the address is absent from the ranked set for the chosen metric. */
export interface AccountStatsRankResult {
  address: string;
  netPnL: string;
  gains: string;
  losses: string;
  volume: string;
  rank: number | null;
  totalParticipants: number;
}

export const GET_ACCURACY_LEADERBOARD_PAGE = /* GraphQL */ `
  query AccuracyLeaderboardPage($take: Int!, $skip: Int!) {
    accuracyLeaderboardPage(take: $take, skip: $skip) {
      items {
        address
        accuracyScore
      }
      hasMore
    }
  }
`;

export const GET_ACCOUNT_ACCURACY_RANK = /* GraphQL */ `
  query AccountAccuracyRank($address: String!) {
    accountAccuracyRank(address: $address) {
      address
      accuracyScore
      rank
      totalForecasters
    }
  }
`;

export const GET_ACCOUNT_STATS_LEADERBOARD_PAGE = /* GraphQL */ `
  query AccountStatsLeaderboardPage(
    $filters: AccountStatsFilters!
    $take: Int!
    $skip: Int!
  ) {
    accountStatsLeaderboardPage(filters: $filters, take: $take, skip: $skip) {
      items {
        address
        netPnL
        gains
        losses
        volume
      }
      hasMore
    }
  }
`;

export const GET_ACCOUNT_STATS_RANK = /* GraphQL */ `
  query AccountStatsRank(
    $address: String!
    $metric: AccountStatMetric! = NET_PNL
    $fromEpoch: Int
    $toEpoch: Int
  ) {
    accountStatsRank(
      address: $address
      metric: $metric
      fromEpoch: $fromEpoch
      toEpoch: $toEpoch
    ) {
      address
      netPnL
      gains
      losses
      volume
      rank
      totalParticipants
    }
  }
`;

/** Convert a Date/string/epoch-seconds input into an epoch-seconds Int for
 *  the wire `fromEpoch`/`toEpoch` args. Strings are parsed as ISO; numbers
 *  pass through (assumed already-seconds). */
const toEpochOrNull = (v?: Date | string | number | null): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const d = v instanceof Date ? v : new Date(v);
  return Math.floor(d.getTime() / 1000);
};

/**
 * Convenience wrapper: same Date/string-friendly inputs as before, fetches
 * the new `accountStatsLeaderboardPage` Page form, returns just the rows.
 * For pagination + hasMore + totalCount, call the Page form via the GraphQL
 * client directly using `GET_ACCOUNT_STATS_LEADERBOARD_PAGE`.
 */
export async function fetchAccountStatsLeaderboard(params: {
  metric: AccountStatMetric;
  from?: Date | string | number | null;
  to?: Date | string | number | null;
  limit?: number;
  skip?: number;
}): Promise<AccountStatEntry[]> {
  const data = await graphqlRequest<{
    accountStatsLeaderboardPage: {
      items: AccountStatEntry[];
      hasMore: boolean;
    };
  }>(GET_ACCOUNT_STATS_LEADERBOARD_PAGE, {
    filters: {
      metric: params.metric,
      fromEpoch: toEpochOrNull(params.from),
      toEpoch: toEpochOrNull(params.to),
    },
    take: params.limit ?? 25,
    skip: params.skip ?? 0,
  });
  return data?.accountStatsLeaderboardPage?.items || [];
}

export async function fetchAccountStatsRank(params: {
  address: string;
  metric?: AccountStatMetric;
  from?: Date | string | number | null;
  to?: Date | string | number | null;
}): Promise<AccountStatsRankResult> {
  const addressLc = params.address.toLowerCase();
  const data = await graphqlRequest<{
    accountStatsRank: AccountStatsRankResult | null;
  }>(GET_ACCOUNT_STATS_RANK, {
    address: addressLc,
    metric: params.metric ?? 'NET_PNL',
    fromEpoch: toEpochOrNull(params.from),
    toEpoch: toEpochOrNull(params.to),
  });
  const r = data?.accountStatsRank;
  if (!r) {
    return {
      address: addressLc,
      netPnL: '0',
      gains: '0',
      losses: '0',
      volume: '0',
      rank: null,
      totalParticipants: 0,
    };
  }
  return r;
}

/**
 * Convenience wrapper: keep the original `limit` signature, internally
 * call the Page form and return just the rows. For pagination + hasMore
 * + totalCount, use `GET_ACCURACY_LEADERBOARD_PAGE` directly.
 */
export async function fetchAccuracyLeaderboard(
  limit = 10
): Promise<ForecasterScore[]> {
  const data = await graphqlRequest<{
    accuracyLeaderboardPage: { items: ForecasterScore[]; hasMore: boolean };
  }>(GET_ACCURACY_LEADERBOARD_PAGE, { take: limit, skip: 0 });
  return data?.accuracyLeaderboardPage?.items || [];
}

export async function fetchAccountAccuracyRank(
  address: string
): Promise<AccuracyRankResult> {
  const a = address.toLowerCase();
  const data = await graphqlRequest<{
    accountAccuracyRank: AccuracyRankResult | null;
  }>(GET_ACCOUNT_ACCURACY_RANK, { address: a });
  const r = data?.accountAccuracyRank;
  if (!r) {
    return { address: a, accuracyScore: 0, rank: null, totalForecasters: 0 };
  }
  return r;
}
