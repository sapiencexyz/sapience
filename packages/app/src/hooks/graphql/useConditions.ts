import { useQuery } from '@tanstack/react-query';
import {
  fetchConditions,
  type ConditionType,
  type ConditionFilters,
} from '@sapience/sdk/queries';

export const useConditions = (opts?: {
  take?: number;
  skip?: number;
  chainId?: number;
  filters?: ConditionFilters;
}) => {
  const take = opts?.take ?? 50;
  const skip = opts?.skip ?? 0;
  const chainId = opts?.chainId;
  const filters = opts?.filters;

  return useQuery<ConditionType[], Error>({
    queryKey: ['conditions', take, skip, chainId, filters],
    queryFn: () => fetchConditions({ take, skip, chainId, filters }),
  });
};

export type { ConditionType, ConditionFilters };
