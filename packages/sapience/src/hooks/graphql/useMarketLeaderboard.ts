import { useQuery } from '@tanstack/react-query';

import { foilApi } from '~/lib/utils/util';

interface MarketLeaderboardEntry {
  owner: string;
  totalPnL: number;
}

interface RawMarketLeaderboardEntry {
  marketId: number;
  owner: string;
  totalPnL: string;
  openPositionsPnL: string;
  totalDeposits: string;
  totalWithdrawals: string;
  positionCount: number;
}

const GET_MARKET_LEADERBOARD = `
  query GetMarketLeaderboard($chainId: Int!, $address: String!, $marketId: String!) {
    getMarketLeaderboard(chainId: $chainId, address: $address, marketId: $marketId) {
      marketId
      owner
      totalPnL
      openPositionsPnL
      totalDeposits
      totalWithdrawals
      positionCount
    }
  }
`;

const useCryptoPrices = () => {
  return useQuery({
    queryKey: ['cryptoPrices'],
    queryFn: async () => {
      try {
        const response = await foilApi.get('/crypto-prices');

        const prices = {
          ethereum: { usd: response?.eth ?? null },
          bitcoin: { usd: response?.btc ?? null },
          solana: { usd: response?.sol ?? null },
        };

        prices.ethereum.usd =
          prices.ethereum.usd !== null ? Number(prices.ethereum.usd) : null;
        prices.bitcoin.usd =
          prices.bitcoin.usd !== null ? Number(prices.bitcoin.usd) : null;
        prices.solana.usd =
          prices.solana.usd !== null ? Number(prices.solana.usd) : null;

        if (Number.isNaN(prices.ethereum.usd as number)) {
          prices.ethereum.usd = null;
        }
        if (Number.isNaN(prices.bitcoin.usd as number)) {
          prices.bitcoin.usd = null;
        }
        if (Number.isNaN(prices.solana.usd as number)) {
          prices.solana.usd = null;
        }

        return prices;
      } catch (error) {
        console.error('Error fetching crypto prices:', error);
        return {
          ethereum: { usd: null },
          bitcoin: { usd: null },
          solana: { usd: null },
        };
      }
    },
    staleTime: 60 * 1000,
  });
};

const useStEthPerToken = (chainId = 1) => {
  return useQuery({
    queryKey: ['stEthPerToken', chainId],
    queryFn: async () => {
      try {
        const response = await foilApi.get(
          `/getStEthPerTokenAtTimestamps?chainId=${chainId}`
        );

        if (
          response?.stEthPerToken &&
          typeof response.stEthPerToken === 'string'
        ) {
          return response.stEthPerToken;
        }
        return '1100000000000000000';
      } catch (error) {
        console.error('Error fetching stEthPerToken:', error);
        return '1100000000000000000';
      }
    },
    staleTime: 60 * 1000,
  });
};

export const useMarketLeaderboard = (
  marketAddress: string | null,
  chainId: number | null,
  marketId: string | null
) => {
  const { data: cryptoPrices } = useCryptoPrices();
  const { data: stEthPerToken } = useStEthPerToken(chainId || 1);

  const leaderboardQuery = useQuery<MarketLeaderboardEntry[]>({
    queryKey: ['marketLeaderboard', marketAddress, chainId, marketId],
    queryFn: async () => {
      if (!marketAddress || !chainId || !marketId) {
        return [];
      }

      const graphqlEndpoint =
        process.env.NEXT_PUBLIC_GRAPHQL_ENDPOINT || '/graphql';

      try {
        const response = await foilApi.post(graphqlEndpoint, {
          query: GET_MARKET_LEADERBOARD,
          variables: {
            chainId,
            address: marketAddress,
            marketId: String(marketId),
          },
        });

        if (response.errors) {
          console.error('GraphQL Errors:', response.errors);
          throw new Error('Failed to fetch market leaderboard');
        }

        const rawData: RawMarketLeaderboardEntry[] =
          response.data?.getMarketLeaderboard || [];

        const processedData: MarketLeaderboardEntry[] = rawData
          .map((entry) => {
            try {
              const pnlString = entry.totalPnL || '0';
              const pnlValue = BigInt(pnlString);
              const pnlNumber = Number(pnlValue);

              if (Number.isNaN(pnlNumber)) {
                return null;
              }

              return {
                owner: entry.owner,
                totalPnL: pnlNumber,
              };
            } catch (error) {
              console.error(
                `Error processing entry for owner ${entry.owner}:`,
                error
              );
              return null;
            }
          })
          .filter((entry): entry is MarketLeaderboardEntry => entry !== null)
          .sort((a, b) => b.totalPnL - a.totalPnL);

        return processedData.slice(0, 10);
      } catch (error) {
        console.error('Error in useMarketLeaderboard:', error);
        return [];
      }
    },
    enabled: Boolean(marketAddress && chainId && marketId),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const ethPriceUsd = cryptoPrices?.ethereum?.usd || null;
  const stEthPerTokenNormalized =
    stEthPerToken && typeof stEthPerToken === 'string'
      ? Number(stEthPerToken) / 1e18
      : null;
  const wstEthPriceUsd =
    stEthPerTokenNormalized !== null && ethPriceUsd !== null
      ? stEthPerTokenNormalized * ethPriceUsd
      : null;

  return {
    leaderboardData: leaderboardQuery.data,
    isLoading: leaderboardQuery.isLoading,
    error: leaderboardQuery.error,
    wstEthPriceUsd,
  };
};

export type { MarketLeaderboardEntry };
