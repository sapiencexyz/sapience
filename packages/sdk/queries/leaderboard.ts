import { graphqlRequest } from './client/graphqlClient';

export interface AggregatedLeaderboardEntry {
  owner: string;
  totalPnL: number;
}

export type ForecasterScore = {
  attester: string;
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
  totalPnL: number;
  rank: number | null;
  totalParticipants: number;
}

const GET_ALL_TIME_PROFIT_LEADERBOARD = /* GraphQL */ `
  query AllTimeProfitLeaderboard {
    allTimeProfitLeaderboard {
      owner
      totalPnL
    }
  }
`;

const GET_TOP_FORECASTERS = /* GraphQL */ `
  query TopForecasters($limit: Int!) {
    topForecasters(limit: $limit) {
      attester
      numScored
      sumErrorSquared
      numTimeWeighted
      sumTimeWeightedError
      accuracyScore
    }
  }
`;

const GET_ACCURACY_RANK = /* GraphQL */ `
  query AccuracyRankByAddress($attester: String!) {
    accuracyRankByAddress(attester: $attester) {
      attester
      accuracyScore
      rank
      totalForecasters
    }
  }
`;

export async function fetchLeaderboard(): Promise<AggregatedLeaderboardEntry[]> {
  const data = await graphqlRequest<{
    allTimeProfitLeaderboard: AggregatedLeaderboardEntry[];
  }>(GET_ALL_TIME_PROFIT_LEADERBOARD);
  return (data?.allTimeProfitLeaderboard || []).slice(0, 100);
}

export async function fetchAccuracyLeaderboard(
  limit = 10
): Promise<ForecasterScore[]> {
  const data = await graphqlRequest<{ topForecasters: ForecasterScore[] }>(
    GET_TOP_FORECASTERS,
    { limit }
  );
  return data.topForecasters || [];
}

export async function fetchForecasterRank(
  attester: string
): Promise<ForecasterRankResult> {
  const a = attester.toLowerCase();
  const data = await graphqlRequest<{
    accuracyRankByAddress: {
      accuracyScore: number;
      rank: number | null;
      totalForecasters: number;
    };
  }>(GET_ACCURACY_RANK, { attester: a });
  const r = data?.accuracyRankByAddress;
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
    allTimeProfitLeaderboard: Array<{
      owner: string;
      totalPnL: number;
    }>;
  }>(GET_ALL_TIME_PROFIT_LEADERBOARD);

  const entries = data?.allTimeProfitLeaderboard || [];
  const sortedEntries = entries.sort((a, b) => b.totalPnL - a.totalPnL);

  const totalParticipants = sortedEntries.length;
  const index = sortedEntries.findIndex(
    (e) => e.owner.toLowerCase() === addressLc
  );
  const userEntry = sortedEntries.find(
    (e) => e.owner.toLowerCase() === addressLc
  );
  const totalPnL = userEntry?.totalPnL || 0;
  const rank = index >= 0 ? index + 1 : null;

  return { totalPnL, rank, totalParticipants };
}
