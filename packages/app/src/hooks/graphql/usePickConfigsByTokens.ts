'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { paginateConnection } from '@sapience/sdk/queries';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import {
  PICK_CONFIGURATION_FIELDS,
  toPickConfigData,
  type AdaptedPickConfigData,
  type AdaptedPickData,
  type PickConfigurationNode,
} from '~/lib/adapters/pickConfig';

// `picks.condition` is fetched inline so callers can build their
// conditionsMap from a single round trip. Tokens move into `filter`,
// `take` becomes `first`, and orderBy is explicit (server defaults can differ
// from the previous query's). Node mapping (escrow → marketAddress, resolver →
// conditionResolver, YES/NO → 1/0, …) lives in the shared adapter.
export const PICK_CONFIGS_BY_TOKENS_QUERY = `
  query PickConfigsByTokens($tokens: [Address!], $first: Int, $after: String) {
    pickConfigurations(
      filter: { tokens: $tokens }
      first: $first
      after: $after
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        ${PICK_CONFIGURATION_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type TokenPickConfig = {
  pickConfig: AdaptedPickConfigData;
  picks: AdaptedPickData[];
  isPredictorToken: boolean;
};

export function usePickConfigsByTokens(tokens: string[]) {
  const sorted = useMemo(
    () => Array.from(new Set(tokens.map((t) => t.toLowerCase()))).sort(),
    [tokens]
  );
  const enabled = sorted.length > 0;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['pickConfigsByTokens', ...sorted],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const nodes = await paginateConnection<PickConfigurationNode>({
        fetchPage: async ({ first, after }) => {
          const resp = await graphqlRequest<{
            pickConfigurations: {
              nodes?: PickConfigurationNode[];
              pageInfo?: { hasNextPage: boolean; endCursor: string | null };
            } | null;
          }>(PICK_CONFIGS_BY_TOKENS_QUERY, {
            tokens: sorted,
            first,
            after,
          });
          return {
            nodes: resp?.pickConfigurations?.nodes ?? [],
            pageInfo: resp?.pickConfigurations?.pageInfo,
          };
        },
      });
      return nodes.map(toPickConfigData);
    },
  });

  const map = useMemo(() => {
    const result = new Map<string, TokenPickConfig>();
    if (!data) return result;

    for (const pc of data) {
      if (pc.predictorToken) {
        const key = pc.predictorToken.toLowerCase();
        if (sorted.includes(key)) {
          result.set(key, {
            pickConfig: pc,
            picks: pc.picks,
            isPredictorToken: true,
          });
        }
      }
      if (pc.counterpartyToken) {
        const key = pc.counterpartyToken.toLowerCase();
        if (sorted.includes(key)) {
          result.set(key, {
            pickConfig: pc,
            picks: pc.picks,
            isPredictorToken: false,
          });
        }
      }
    }
    return result;
  }, [data, sorted]);

  return { map, isLoading: !!enabled && (isLoading || isFetching) };
}
