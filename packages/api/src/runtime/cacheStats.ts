/**
 * Process-wide in-memory cache gauges for leak diagnosis.
 * Emitted on `gql_inflight` when GRAPHQL_INFLIGHT_DUMP_INTERVAL_MS > 0.
 */

import { getAccountStatsCacheStats } from '../graphql/v2/resolvers/queries/accountStats';
import { getProtocolStatsCacheStats } from '../graphql/sdl/resolvers/queries/analytics';

export type CacheGauge = {
  size: number;
  live: number;
};

export type CacheStatsSnapshot = Record<string, CacheGauge>;

export function collectCacheStats(): CacheStatsSnapshot {
  const accountStats = getAccountStatsCacheStats();
  return {
    accountStatsMerged: accountStats.merged,
    accountStatsAccuracy: accountStats.accuracy,
    protocolStatsV1: getProtocolStatsCacheStats(),
  };
}
