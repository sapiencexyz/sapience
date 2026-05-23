import { useQuery } from '@tanstack/react-query';
import {
  fetchConditionGroups,
  type ConditionGroupType,
  type ConditionGroupConditionType,
  type ConditionGroupFilters,
} from '@sapience/sdk/queries';

export const useConditionGroups = (opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionGroupFilters;
  includeEmptyGroups?: boolean;
}) => {
  const take = opts?.take ?? 100;
  const skip = opts?.skip ?? 0;
  const chainId = opts?.chainId;
  const filters = opts?.filters;
  const includeEmptyGroups = opts?.includeEmptyGroups ?? false;

  return useQuery<ConditionGroupType[], Error>({
    queryKey: [
      'conditionGroups',
      take,
      skip,
      chainId,
      filters,
      includeEmptyGroups,
    ],
    queryFn: () =>
      fetchConditionGroups({
        take,
        skip,
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
