import { graphqlRequest } from './client/graphqlClient';
import { toEpochOrNull } from './client/timeArgs';

export type AccountStatsMetric = 'NET_PNL' | 'GAINS' | 'LOSSES' | 'VOLUME';

/** All amounts are wei strings (18 decimals); `losses` is negative. */
export interface AccountStatsLeaderboardEntry {
  address: string;
  netPnL: string;
  gains: string;
  losses: string;
  volume: string;
}

/** Row shape returned by `accuracyLeaderboardPage` — one row of the accuracy
 *  leaderboard with the lifetime time-weighted accuracy score. */
export type AccuracyLeaderboardEntry = {
  address: string;
  accuracyScore: number;
};

/** Single-address result from `accountAccuracyRank`. `accuracyScore` is always
 *  a number (zero when unscored); `rank` is null for unscored addresses;
 *  `totalParticipants` mirrors `AccountStatsRank`. */
export interface AccuracyRankResult {
  address: string;
  accuracyScore: number;
  rank: number | null;
  totalParticipants: number;
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
      totalParticipants
    }
  }
`;

export const GET_ACCOUNT_STATS_LEADERBOARD_PAGE = /* GraphQL */ `
  query AccountStatsLeaderboardPage(
    $filters: AccountStatsFilters
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
  query AccountStatsRank($address: String!, $filters: AccountStatsFilters) {
    accountStatsRank(address: $address, filters: $filters) {
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

/**
 * Convenience wrapper: same Date/string-friendly inputs as before, fetches
 * the `accountStatsLeaderboardPage` Page form, returns just the rows.
 * For pagination + hasMore + totalCount, call the Page form via the GraphQL
 * client directly using `GET_ACCOUNT_STATS_LEADERBOARD_PAGE`.
 */
export async function fetchAccountStatsLeaderboard(params: {
  metric: AccountStatsMetric;
  from?: Date | string | number | null;
  to?: Date | string | number | null;
  limit?: number;
  skip?: number;
}): Promise<AccountStatsLeaderboardEntry[]> {
  const data = await graphqlRequest<{
    accountStatsLeaderboardPage: {
      items: AccountStatsLeaderboardEntry[];
      hasMore: boolean;
    };
  }>(GET_ACCOUNT_STATS_LEADERBOARD_PAGE, {
    filters: {
      metric: params.metric,
      from: toEpochOrNull(params.from),
      to: toEpochOrNull(params.to),
    },
    take: params.limit ?? 25,
    skip: params.skip ?? 0,
  });
  return data?.accountStatsLeaderboardPage?.items || [];
}

/**
 * Convenience wrapper for single-address rank + stats. `filters` is optional
 * on the wire; we only send one when the caller actually provided a `metric`
 * or window, so the resolver falls through to its default (NET_PNL, all-time).
 */
export async function fetchAccountStatsRank(params: {
  address: string;
  metric?: AccountStatsMetric;
  from?: Date | string | number | null;
  to?: Date | string | number | null;
}): Promise<AccountStatsRankResult> {
  const addressLc = params.address.toLowerCase();
  const from = toEpochOrNull(params.from);
  const to = toEpochOrNull(params.to);
  const filters =
    params.metric !== undefined || from !== null || to !== null
      ? {
          metric: params.metric,
          from,
          to,
        }
      : null;
  const data = await graphqlRequest<{
    accountStatsRank: AccountStatsRankResult | null;
  }>(GET_ACCOUNT_STATS_RANK, { address: addressLc, filters });
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
  limit = 25
): Promise<AccuracyLeaderboardEntry[]> {
  const data = await graphqlRequest<{
    accuracyLeaderboardPage: {
      items: AccuracyLeaderboardEntry[];
      hasMore: boolean;
    };
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
    return { address: a, accuracyScore: 0, rank: null, totalParticipants: 0 };
  }
  return r;
}
