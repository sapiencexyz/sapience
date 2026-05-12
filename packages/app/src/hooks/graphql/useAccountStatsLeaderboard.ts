import { useQuery } from '@tanstack/react-query';
import {
  fetchAccountStatsLeaderboard,
  type AccountStatEntry,
  type AccountStatMetric,
} from '@sapience/sdk/queries';

import { PERIOD_DAYS, type Period } from '~/components/shared/PeriodFilter';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Window start for a period, or `undefined` for ALL (no lower bound). */
export function periodToFrom(period: Period): Date | undefined {
  const days = PERIOD_DAYS[period];
  return Number.isFinite(days)
    ? new Date(Date.now() - days * DAY_MS)
    : undefined;
}

export function useAccountStatsLeaderboard(
  metric: AccountStatMetric,
  period: Period,
  limit = 10
) {
  return useQuery<AccountStatEntry[]>({
    queryKey: ['accountStatsLeaderboard', metric, period, limit],
    queryFn: async () => {
      try {
        return await fetchAccountStatsLeaderboard({
          metric,
          from: periodToFrom(period),
          limit,
        });
      } catch (error) {
        console.error('Error in useAccountStatsLeaderboard:', error);
        return [];
      }
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export type { AccountStatEntry, AccountStatMetric };
