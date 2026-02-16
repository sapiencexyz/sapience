import { useQuery } from '@tanstack/react-query';
import {
  fetchLastTradePositions,
  findMatchingPosition,
  type LastPositionForIntent,
} from '@sapience/sdk/queries';

export function useLastTradeForIntent(params: {
  predictor?: string | null;
  outcomesSignature?: string | null;
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
    queryFn: () => fetchLastTradePositions(predictor, take),
    select: (resp) => {
      const list = resp?.positions || [];
      const match = findMatchingPosition(list, outcomesSignature);
      return { last: match } as { last: LastPositionForIntent | null } as any;
    },
  });

  return { data: (data as any)?.last ?? null, isFetching, refetch };
}
