import { useQuery } from '@tanstack/react-query';
import {
  fetchConditions,
  type ConditionType,
  type ConditionFilters,
} from '@sapience/sdk/queries';

export const useConditions = (opts?: {
  take?: number;
  /**
   * Opaque cursor from the previous page's `endCursor`. Connections are
   * cursor-only — there is no `skip`. For infinite scroll, prefer
   * `useInfiniteQuery` with `pageParam` driving `after`.
   */
  after?: string | null;
  chainId?: number;
  filters?: ConditionFilters;
}) => {
  const take = opts?.take ?? 50;
  const after = opts?.after ?? null;
  const chainId = opts?.chainId;
  const filters = opts?.filters;

  return useQuery<ConditionType[], Error>({
    queryKey: ['conditions', take, after, chainId, filters],
    queryFn: () => fetchConditions({ take, after, chainId, filters }),
  });
};

export type { ConditionType, ConditionFilters };
