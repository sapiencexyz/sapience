import { graphqlRequest } from './client/graphqlClient';

export interface AggregatedLeaderboardEntry {
  address: string;
  totalPnL: string;
}

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

export const GET_PROFIT_LEADERBOARD = /* GraphQL */ `
  query ProfitLeaderboard($limit: Int, $skip: Int) {
    profitLeaderboard(limit: $limit, skip: $skip) {
      address
      totalPnL
    }
  }
`;

export const GET_ACCURACY_LEADERBOARD = /* GraphQL */ `
  query AccuracyLeaderboard($limit: Int!) {
    accuracyLeaderboard(limit: $limit) {
      address
      accuracyScore
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

export const GET_ACCOUNT_STATS_LEADERBOARD = /* GraphQL */ `
  query AccountStatsLeaderboard(
    $metric: AccountStatMetric!
    $from: DateTimeISO
    $to: DateTimeISO
    $limit: Int!
    $skip: Int!
  ) {
    accountStatsLeaderboard(
      metric: $metric
      from: $from
      to: $to
      limit: $limit
      skip: $skip
    ) {
      address
      netPnL
      gains
      losses
      volume
    }
  }
`;

export const GET_ACCOUNT_STATS_RANK = /* GraphQL */ `
  query AccountStatsRank(
    $address: String!
    $metric: AccountStatMetric! = NET_PNL
    $from: DateTimeISO
    $to: DateTimeISO
  ) {
    accountStatsRank(address: $address, metric: $metric, from: $from, to: $to) {
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

const toIsoOrNull = (v?: Date | string | null): string | null =>
  v == null ? null : v instanceof Date ? v.toISOString() : v;

export async function fetchAccountStatsLeaderboard(params: {
  metric: AccountStatMetric;
  from?: Date | string | null;
  to?: Date | string | null;
  limit?: number;
  skip?: number;
}): Promise<AccountStatEntry[]> {
  const data = await graphqlRequest<{
    accountStatsLeaderboard: AccountStatEntry[];
  }>(GET_ACCOUNT_STATS_LEADERBOARD, {
    metric: params.metric,
    from: toIsoOrNull(params.from),
    to: toIsoOrNull(params.to),
    limit: params.limit ?? 25,
    skip: params.skip ?? 0,
  });
  return data?.accountStatsLeaderboard || [];
}

export async function fetchAccountStatsRank(params: {
  address: string;
  metric?: AccountStatMetric;
  from?: Date | string | null;
  to?: Date | string | null;
}): Promise<AccountStatsRankResult> {
  const addressLc = params.address.toLowerCase();
  const data = await graphqlRequest<{
    accountStatsRank: AccountStatsRankResult | null;
  }>(GET_ACCOUNT_STATS_RANK, {
    address: addressLc,
    metric: params.metric ?? 'NET_PNL',
    from: toIsoOrNull(params.from),
    to: toIsoOrNull(params.to),
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

export async function fetchLeaderboard(): Promise<
  AggregatedLeaderboardEntry[]
> {
  const data = await graphqlRequest<{
    profitLeaderboard: AggregatedLeaderboardEntry[];
  }>(GET_PROFIT_LEADERBOARD);
  return (data?.profitLeaderboard || []).slice(0, 100);
}

export async function fetchAccuracyLeaderboard(
  limit = 10
): Promise<ForecasterScore[]> {
  const data = await graphqlRequest<{ accuracyLeaderboard: ForecasterScore[] }>(
    GET_ACCURACY_LEADERBOARD,
    { limit }
  );
  return data.accuracyLeaderboard || [];
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
