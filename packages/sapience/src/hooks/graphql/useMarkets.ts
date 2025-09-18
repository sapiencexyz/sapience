import { graphqlRequest } from '@sapience/ui/lib';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

type MarketIdentifier = {
  address: string;
  marketId: number;
};

type MarketsBatchArgs = {
  chainId: number;
  markets: MarketIdentifier[];
};

type MarketsBatchResultItem = {
  marketId: number;
  question: string | null;
  shortName?: string | null;
  marketGroup: { address: string; chainId: number };
};

const MARKETS_BATCH_QUERY = /* GraphQL */ `
  query MarketsBatch($where: MarketWhereInput!) {
    markets(where: $where) {
      marketId
      question
      shortName
      marketGroup {
        address
        chainId
      }
    }
  }
`;

/**
 * Batch-fetch market questions for multiple (address, marketId) pairs in a single request.
 * Returns a map keyed by `${chainId}:${address.toLowerCase()}:${marketId}` → question string.
 */
export function useMarkets({ chainId, markets }: MarketsBatchArgs) {
  const normalized = useMemo(() => {
    const grouped = new Map<string, Set<number>>();
    for (const m of markets) {
      const addr = m.address.toLowerCase();
      const set = grouped.get(addr) ?? new Set<number>();
      set.add(Number(m.marketId));
      grouped.set(addr, set);
    }
    return grouped;
  }, [markets]);

  const enabled = useMemo(
    () => chainId > 0 && normalized.size > 0,
    [chainId, normalized]
  );

  const queryKey = useMemo(() => {
    // Stable key: chainId + sorted address groups + sorted ids per address
    const parts: string[] = [];
    const addrs = Array.from(normalized.keys()).sort();
    for (const a of addrs) {
      const ids = Array.from(normalized.get(a) ?? []).sort((x, y) => x - y);
      parts.push(`${a}:${ids.join(',')}`);
    }
    return ['marketsBatch', chainId, parts.join('|')];
  }, [chainId, normalized]);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey,
    enabled,
    queryFn: async () => {
      // Build OR of AND clauses, grouping by address to leverage marketId: { in: [...] }
      const orClauses = Array.from(normalized.entries()).map(
        ([address, ids]) => ({
          AND: [
            {
              marketGroup: {
                is: {
                  address: { equals: address },
                  chainId: { equals: chainId },
                },
              },
            },
            { marketId: { in: Array.from(ids) } },
          ],
        })
      );

      type MarketsQueryResult = { markets: MarketsBatchResultItem[] };
      const resp = await graphqlRequest<MarketsQueryResult>(
        MARKETS_BATCH_QUERY,
        {
          where: { OR: orClauses },
        }
      );

      const items = resp?.markets ?? [];
      const map = new Map<string, string>();
      for (const it of items) {
        const key = `${it.marketGroup.chainId}:${it.marketGroup.address.toLowerCase()}:${it.marketId}`;
        const q = it.shortName || it.question;
        if (q) map.set(key, q);
      }
      return map;
    },
  });

  return {
    questionsMap: data ?? new Map<string, string>(),
    isLoading: !!enabled && (isLoading || isFetching),
    error: error,
  };
}
