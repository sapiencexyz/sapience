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

export type ForecasterScore = {
  address: string;
  numScored: number;
  sumErrorSquared: number;
  numTimeWeighted: number;
  sumTimeWeightedError: number;
  accuracyScore: number;
};

export interface ForecasterRankResult {
  accuracyScore: number | null;
  rank: number | null;
  totalForecasters: number;
}

export interface UserProfitRankResult {
  totalPnL: string;
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
      numScored
      sumErrorSquared
      numTimeWeighted
      sumTimeWeightedError
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

export async function fetchForecasterRank(
  address: string
): Promise<ForecasterRankResult> {
  const a = address.toLowerCase();
  const data = await graphqlRequest<{
    accountAccuracyRank: {
      accuracyScore: number;
      rank: number | null;
      totalForecasters: number;
    };
  }>(GET_ACCOUNT_ACCURACY_RANK, { address: a });
  const r = data?.accountAccuracyRank;
  if (!r) return { accuracyScore: null, rank: null, totalForecasters: 0 };
  return {
    accuracyScore: r.accuracyScore ?? 0,
    rank: r.rank,
    totalForecasters: r.totalForecasters ?? 0,
  };
}

export async function fetchUserProfitRank(
  ownerAddress: string
): Promise<UserProfitRankResult> {
  const addressLc = ownerAddress.toLowerCase();

  const data = await graphqlRequest<{
    profitLeaderboard: Array<{
      address: string;
      totalPnL: string;
    }>;
  }>(GET_PROFIT_LEADERBOARD, { limit: 100 });

  const entries = data?.profitLeaderboard || [];
  const sortedEntries = entries.sort(
    (a, b) => parseFloat(b.totalPnL) - parseFloat(a.totalPnL)
  );

  const totalParticipants = sortedEntries.length;
  const index = sortedEntries.findIndex(
    (e) => e.address.toLowerCase() === addressLc
  );
  const userEntry = sortedEntries.find(
    (e) => e.address.toLowerCase() === addressLc
  );
  const totalPnL = userEntry?.totalPnL || '0';
  const rank = index >= 0 ? index + 1 : null;

  return { totalPnL, rank, totalParticipants };
}
