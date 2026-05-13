import { useQuery } from '@tanstack/react-query';
import {
  fetchAccuracyLeaderboard,
  type AccuracyLeaderboardEntry,
} from '@sapience/sdk/queries';

export const useAccuracyLeaderboard = (limit = 25) => {
  return useQuery<AccuracyLeaderboardEntry[]>({
    queryKey: ['accuracyLeaderboard', limit],
    queryFn: () => fetchAccuracyLeaderboard(limit),
  });
};

export type { AccuracyLeaderboardEntry };
