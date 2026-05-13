import { useQuery } from '@tanstack/react-query';
import {
  fetchAccountStatsLeaderboard,
  type AccountStatEntry,
  type AccountStatMetric,
} from '@sapience/sdk/queries';

import {
  rangeKey,
  rangeToDates,
  type TimeRange,
} from '~/components/shared/timeRange';

export function useAccountStatsLeaderboard(
  metric: AccountStatMetric,
  range: TimeRange,
  limit = 10
) {
  return useQuery<AccountStatEntry[]>({
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
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export type { AccountStatEntry, AccountStatMetric };
