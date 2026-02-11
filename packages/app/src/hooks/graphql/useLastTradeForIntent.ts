import { useQuery } from '@tanstack/react-query';
import { graphqlRequest } from '@sapience/sdk/queries/client/graphqlClient';

type LastPositionForIntent = {
  mintedAt: number;
  predictor: string;
  counterparty: string;
  predictorCollateral?: string | null;
  counterpartyCollateral?: string | null;
  totalCollateral: string;
};

export function useLastTradeForIntent(params: {
  predictor?: string | null;
  outcomesSignature?: string | null; // normalized JSON string
  take?: number;
}) {
  const predictor = (params.predictor || '')?.toLowerCase?.() || '';
  const outcomesSignature = params.outcomesSignature || '';
  const take = Math.min(params.take ?? 100, 100);
  const enabled = Boolean(predictor && outcomesSignature);
  const key = ['lastTrade', 'predictor', predictor, outcomesSignature] as const;

  const { data, isFetching, refetch } = useQuery<{
    positions: Array<{
      mintedAt: number;
      predictor: string;
      counterparty: string;
      predictorCollateral?: string | null;
      counterpartyCollateral?: string | null;
      totalCollateral: string;
      predictions: Array<{ conditionId: string; outcomeYes: boolean }>;
    }>;
  }>({
    queryKey: key,
    enabled,
    staleTime: 15_000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const QUERY = /* GraphQL */ `
        query PositionsForLastTrade($address: String!, $take: Int) {
          positions(address: $address, take: $take) {
            mintedAt
            predictor
            counterparty
            predictorCollateral
            counterpartyCollateral
            totalCollateral
            predictions {
              conditionId
              outcomeYes
            }
          }
        }
      `;
      return await graphqlRequest(QUERY, { address: predictor, take });
    },
    select: (resp) => {
      const list = resp?.positions || [];
      // Normalize each position predictions and compare to signature
      const target = outcomesSignature;
      const normalize = (
        arr: Array<{ conditionId: string; outcomeYes: boolean }>
      ) =>
        JSON.stringify(
          (arr || [])
            .map((o) => ({
              conditionId: String(o.conditionId).toLowerCase(),
              prediction: !!o.outcomeYes,
            }))
            .sort((a, b) =>
              a.conditionId === b.conditionId
                ? Number(a.prediction) - Number(b.prediction)
                : a.conditionId.localeCompare(b.conditionId)
            )
        );
      const match =
        list.find((p) => normalize(p.predictions) === target) || null;
      return { last: match } as { last: LastPositionForIntent | null } as any;
    },
  });

  return { data: (data as any)?.last ?? null, isFetching, refetch };
}
