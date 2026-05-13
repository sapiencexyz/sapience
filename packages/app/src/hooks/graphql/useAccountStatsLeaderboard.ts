import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  fetchAccountStatsLeaderboard,
  type AccountStatsLeaderboardEntry,
  type AccountStatsMetric,
} from '@sapience/sdk/queries';

import {
  rangeKey,
  rangeToDates,
  type TimeRange,
} from '~/components/shared/timeRange';

export function useAccountStatsLeaderboard(
  metric: AccountStatsMetric,
  range: TimeRange,
  limit = 10
) {
  return useQuery<AccountStatsLeaderboardEntry[]>({
    queryKey: ['accountStatsLeaderboard', metric, rangeKey(range), limit],
    queryFn: async () => {
      try {
        const { from, to } = rangeToDates(range);
        return await fetchAccountStatsLeaderboard({ metric, from, to, limit });
      } catch (error) {
        console.error('Error in useAccountStatsLeaderboard:', error);
        return [];
      }
    },
    // Hold the previous list while a new (metric, range) combo loads, so the
    // card doesn't collapse to a spinner and re-expand on every tab click.
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export type { AccountStatsLeaderboardEntry, AccountStatsMetric };
