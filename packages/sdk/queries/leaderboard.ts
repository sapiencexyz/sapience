import { graphqlRequest } from './client/graphqlClient';

export interface AggregatedLeaderboardEntry {
  address: string;
  /**
   * Net PnL as a human-readable decimal string (already `formatUnits`'d to
   * 18 decimals server-side via `Ranking.pnlFormatted`).
   */
  totalPnL: string;
}

/**
 * One row of the accuracy leaderboard. Slimmed to what the `Ranking`
 * surface provides — the Brier components (`numScored`, `sumErrorSquared`,
 * `numTimeWeighted`, `sumTimeWeightedError`) do not exist on this surface.
 * `accuracyScore` carries the 0-1 lifetime Brier-derived accuracy.
 */
export type ForecasterScore = {
  address: string;
  rank: number;
  /** Lifetime Brier-derived accuracy, 0-1 (`Ranking.accuracy`). */
  accuracyScore: number;
};

export interface ForecasterRankResult {
  /** 0-1 accuracy; null when unranked. */
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
  query ProfitLeaderboard {
    leaderboard(metric: PNL, first: 25) {
      edges {
        node {
          rank
          pnlFormatted
          account {
            address
          }
        }
      }
    }
  }
`;

export const GET_ACCURACY_LEADERBOARD = /* GraphQL */ `
  query AccuracyLeaderboard($first: Int!) {
    leaderboard(metric: ACCURACY, first: $first) {
      edges {
        node {
          rank
          accuracy
          account {
            address
          }
        }
      }
    }
  }
`;

export const GET_FORECASTER_RANK = /* GraphQL */ `
  query ForecasterRank($address: Address!) {
    account(address: $address) {
      ranking(metric: ACCURACY) {
        rank
        accuracy
      }
    }
    leaderboard(metric: ACCURACY, first: 0) {
      totalCount
    }
  }
`;

export const GET_USER_PROFIT_RANK = /* GraphQL */ `
  query UserProfitRank($address: Address!) {
    account(address: $address) {
      ranking(metric: PNL) {
        rank
        pnlFormatted
      }
    }
    leaderboard(metric: PNL, first: 0) {
      totalCount
    }
  }
`;

type RankingEdges<TNode> = { edges: Array<{ node: TNode }> } | null;

type PnlRankingNode = {
  rank: number;
  pnlFormatted: string;
  account: { address: string };
};

type AccuracyRankingNode = {
  rank: number;
  accuracy: number | null;
  account: { address: string };
};

function toLeaderboardEntries(
  connection: RankingEdges<PnlRankingNode> | undefined
): AggregatedLeaderboardEntry[] {
  const edges = connection?.edges;
  if (!Array.isArray(edges)) return [];
  return edges.map(({ node }) => ({
    address: node.account.address,
    totalPnL: node.pnlFormatted,
  }));
}

function toForecasterScores(
  connection: RankingEdges<AccuracyRankingNode> | undefined
): ForecasterScore[] {
  const edges = connection?.edges;
  if (!Array.isArray(edges)) return [];
  return edges.map(({ node }) => ({
    address: node.account.address,
    rank: node.rank,
    accuracyScore: node.accuracy ?? 0,
  }));
}

export async function fetchLeaderboard(): Promise<
  AggregatedLeaderboardEntry[]
> {
  const data = await graphqlRequest<{
    leaderboard: RankingEdges<PnlRankingNode>;
  }>(GET_PROFIT_LEADERBOARD);
  return toLeaderboardEntries(data?.leaderboard).slice(0, 100);
}

export async function fetchAccuracyLeaderboard(
  limit = 10
): Promise<ForecasterScore[]> {
  const data = await graphqlRequest<{
    leaderboard: RankingEdges<AccuracyRankingNode>;
  }>(GET_ACCURACY_LEADERBOARD, { first: limit });
  return toForecasterScores(data?.leaderboard);
}

export async function fetchForecasterRank(
  address: string
): Promise<ForecasterRankResult> {
  const a = address.toLowerCase();
  const data = await graphqlRequest<{
    account: {
      ranking: { rank: number; accuracy: number | null } | null;
    } | null;
    leaderboard: { totalCount: number } | null;
  }>(GET_FORECASTER_RANK, { address: a });

  const ranking = data?.account?.ranking ?? null;
  const totalForecasters = data?.leaderboard?.totalCount ?? 0;
  if (!ranking) return { accuracyScore: null, rank: null, totalForecasters };
  return {
    accuracyScore: ranking.accuracy ?? 0,
    rank: ranking.rank,
    totalForecasters,
  };
}

/**
 * Asks the server for `account.ranking(metric: PNL)`, which ranks over the
 * FULL ranked population, and `totalParticipants` is the leaderboard's
 * `totalCount`.
 */
export async function fetchUserProfitRank(
  ownerAddress: string
): Promise<UserProfitRankResult> {
  const addressLc = ownerAddress.toLowerCase();
  const data = await graphqlRequest<{
    account: {
      ranking: { rank: number; pnlFormatted: string } | null;
    } | null;
    leaderboard: { totalCount: number } | null;
  }>(GET_USER_PROFIT_RANK, { address: addressLc });

  const ranking = data?.account?.ranking ?? null;
  const totalParticipants = data?.leaderboard?.totalCount ?? 0;
  return {
    totalPnL: ranking?.pnlFormatted ?? '0',
    rank: ranking?.rank ?? null,
    totalParticipants,
  };
}
