import { useQuery } from '@tanstack/react-query';
import {
  fetchAccuracyLeaderboard,
  type AccountAccuracyLeaderboardEntry,
} from '@sapience/sdk/queries';

export const useAccuracyLeaderboard = (limit = 25) => {
  return useQuery<AccountAccuracyLeaderboardEntry[]>({
    queryKey: ['accuracyLeaderboard', limit],
    queryFn: () => fetchAccuracyLeaderboard(limit),
  });
};

export type { AccountAccuracyLeaderboardEntry };
