'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  query PickConfigsByTokens($tokens: [Address!]) {
    pickConfigurations(
      filter: { tokens: $tokens }
      first: 100
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        ${PICK_CONFIGURATION_FIELDS}
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
      const resp = await graphqlRequest<{
        pickConfigurations: { nodes: PickConfigurationNode[] } | null;
      }>(PICK_CONFIGS_BY_TOKENS_QUERY, { tokens: sorted });
      return (resp?.pickConfigurations?.nodes ?? []).map(toPickConfigData);
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
