import { useQuery } from '@tanstack/react-query';
import {
  fetchConditionGroups,
  type ConditionGroupType,
  type ConditionGroupConditionType,
  type ConditionGroupFilters,
} from '@sapience/sdk/queries';

export const useConditionGroups = (opts?: {
  take?: number;
  /** @deprecated Use `after` with a connection page cursor for pagination. */
  skip?: number;
  /**
   * Opaque cursor from the previous page's `endCursor`. Connections are
   * cursor-first; `skip` remains only for legacy compatibility. Prefer
   * `useInfiniteQuery` with `pageParam` driving `after`.
   */
  after?: string | null;
  chainId?: number;
  filters?: ConditionGroupFilters;
  includeEmptyGroups?: boolean;
}) => {
  const take = opts?.take ?? 100;
  const after = opts?.after ?? null;
  const skip = after == null ? (opts?.skip ?? 0) : 0;
  const chainId = opts?.chainId;
  const filters = opts?.filters;
  const includeEmptyGroups = opts?.includeEmptyGroups ?? false;

  return useQuery<ConditionGroupType[], Error>({
    queryKey: [
      'conditionGroups',
      take,
      skip,
      after,
      chainId,
      filters,
      includeEmptyGroups,
    ],
    queryFn: () =>
      fetchConditionGroups({
        take,
        skip,
        after,
        chainId,
        filters,
        includeEmptyGroups,
      }),
  });
};

export type {
  ConditionGroupType,
  ConditionGroupConditionType,
  ConditionGroupFilters,
};
