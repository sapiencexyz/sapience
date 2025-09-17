'use client';

import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/ui/lib';

// Reuse the same market groups and leaderboard queries as the aggregated leaderboard
const GET_MARKET_GROUPS = /* GraphQL */ `
  query MarketGroups {
    marketGroups {
      address
      chainId
      markets {
        marketId
        public
      }
    }
  }
`;

const GET_MARKET_LEADERBOARD = /* GraphQL */ `
  query MarketLeaderboard(
    $chainId: Int!
    $address: String!
    $marketId: String!
  ) {
    getMarketLeaderboard(
      chainId: $chainId
      address: $address
      marketId: $marketId
    ) {
      owner
      totalPnL
      collateralDecimals
    }
  }
`;

type MarketGroup = {
  address?: string | null;
  chainId?: number | null;
  markets?: Array<{
    marketId?: number | string | null;
    public?: boolean | null;
  }>;
};

type MarketGroupsQueryResponse = {
  marketGroups: MarketGroup[];
};

type RawMarketLeaderboardEntry = {
  owner: string;
  totalPnL: string;
  collateralDecimals?: number | null;
};

type MarketLeaderboardQueryResponse = {
  getMarketLeaderboard: RawMarketLeaderboardEntry[];
};

export interface UserProfitRankResult {
  totalPnL: number;
  rank: number | null;
  totalParticipants: number;
}

export const useUserProfitRank = (ownerAddress?: string) => {
  const enabled = Boolean(ownerAddress && ownerAddress.trim() !== '');
  const addressLc = (ownerAddress || '').toLowerCase();

  return useQuery<UserProfitRankResult>({
    queryKey: ['userProfitRank', addressLc],
    enabled,
    queryFn: async () => {
      // 1) Fetch all public markets
      const marketGroupsData =
        await graphqlRequest<MarketGroupsQueryResponse>(GET_MARKET_GROUPS);

      const identifiers: Array<{
        address: string;
        chainId: number;
        marketId: string;
      }> = [];
      for (const mg of marketGroupsData.marketGroups || []) {
        if (!mg?.address || typeof mg.address !== 'string') continue;
        if (typeof mg?.chainId !== 'number') continue;
        for (const m of mg.markets || []) {
          if (m?.public) {
            const marketId = String(m.marketId ?? '');
            if (!marketId) continue;
            identifiers.push({
              address: mg.address,
              chainId: mg.chainId,
              marketId,
            });
          }
        }
      }

      if (identifiers.length === 0) {
        return { totalPnL: 0, rank: null, totalParticipants: 0 };
      }

      // 2) Fetch all market leaderboards in parallel
      const responses = await Promise.all(
        identifiers.map((vars) =>
          graphqlRequest<MarketLeaderboardQueryResponse>(
            GET_MARKET_LEADERBOARD,
            vars
          )
        )
      );

      // 3) Aggregate per-owner PnL (assume $1 tokens)
      const aggregated: Record<string, number> = {};

      for (const resp of responses) {
        const entries = resp?.getMarketLeaderboard || [];
        const decimals = entries?.[0]?.collateralDecimals ?? 18;
        const divisor = Math.pow(10, decimals);
        for (const e of entries) {
          const owner = e.owner?.toLowerCase?.() || '';
          if (!owner) continue;
          const raw = e.totalPnL || '0';
          const pnlTokenAmount = parseFloat(raw) / divisor;
          if (!Number.isFinite(pnlTokenAmount)) continue;
          aggregated[owner] = (aggregated[owner] || 0) + pnlTokenAmount;
        }
      }

      const entries = Object.entries(aggregated)
        .map(([owner, total]) => ({ owner, total }))
        .sort((a, b) => b.total - a.total);

      const totalParticipants = entries.length;
      const index = entries.findIndex((e) => e.owner === addressLc);
      const totalPnL = aggregated[addressLc] || 0;
      const rank = index >= 0 ? index + 1 : null;

      return { totalPnL, rank, totalParticipants };
    },
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
};

