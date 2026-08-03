import { useQuery } from '@tanstack/react-query';
import {
  fetchAccuracyLeaderboard,
  type ForecasterScore,
} from '~/lib/sdk/queries';

export const useAccuracyLeaderboard = (limit = 10) => {
  return useQuery<ForecasterScore[]>({
    queryKey: ['accuracyLeaderboard', limit],
    queryFn: () => fetchAccuracyLeaderboard(limit),
  });
};

export type { ForecasterScore };
