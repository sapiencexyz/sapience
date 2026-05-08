'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';
import type { PickConfigData, PickData } from '~/hooks/graphql/usePositions';

// tokens arg on pickConfigurations added in PR #1440. `picks.condition`
// is fetched inline so callers can build their conditionsMap from a
// single round trip — see Pick resolver + pickConfigurations resolver.
const PICK_CONFIGS_BY_TOKENS_QUERY = `
  query PickConfigsByTokens($tokens: [String!]) {
    pickConfigurationsPage(tokens: $tokens, take: 100) {
      hasMore
      items {
        id
        chainId
        marketAddress
        totalPredictorCollateral
        totalCounterpartyCollateral
        claimedPredictorCollateral
        claimedCounterpartyCollateral
        resolved
        result
        resolvedAt
        predictorToken
        counterpartyToken
        endsAt
        isLegacy
        picks {
          id
          pickConfigId
          conditionResolver
          conditionId
          predictedOutcome
          condition {
            id
            shortName
            optionName
            question
            description
            endTime
            resolver
            settled
            resolvedToYes
            nonDecisive
            estimatedPrice
            category {
              slug
            }
          }
        }
      }
    }
  }
`;

export type TokenPickConfig = {
  pickConfig: PickConfigData;
  picks: PickData[];
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
        pickConfigurationsPage: { items: PickConfigData[]; hasMore: boolean };
      }>(PICK_CONFIGS_BY_TOKENS_QUERY, { tokens: sorted });
      return resp?.pickConfigurationsPage?.items ?? [];
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
