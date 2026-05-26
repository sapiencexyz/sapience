'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchAccountStatsRank,
  type AccountStatsMetric,
  type AccountStatsRankResult,
} from '@sapience/sdk/queries';

/**
 * Per-address stats + rank against the same merged set the leaderboard
 * slices. Backed by `Query.accountStatsRank` — stats fields are always
 * present (zero when no activity); `rank` is null when the address is
 * absent from the ranked set for the chosen metric. Defaults to all-time
 * NET_PNL when no window/metric is provided.
 */
export const useAccountStatsRank = (
  address?: string,
  metric: AccountStatsMetric = 'NET_PNL',
  range?: { from?: Date | string | null; to?: Date | string | null }
) => {
  const enabled = Boolean(address && address.trim() !== '');
  const addressLc = (address || '').toLowerCase();
  const fromKey = range?.from == null ? null : String(range.from);
  const toKey = range?.to == null ? null : String(range.to);

  return useQuery<AccountStatsRankResult>({
    queryKey: ['accountStatsRank', addressLc, metric, fromKey, toKey],
    enabled,
    queryFn: () =>
      fetchAccountStatsRank({
        address: addressLc,
        metric,
        from: range?.from,
        to: range?.to,
      }),
    staleTime: 60_000,
    refetchInterval: 300_000,
  });
};
