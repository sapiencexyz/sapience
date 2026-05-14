/**
 * Deprecated single-address score lookups:
 *
 *   - accountAccuracy — replaced by `accountAccuracyRank` (rank shape) and
 *     `accuracyLeaderboardPage` (list shape). Both source the same
 *     `getLeaderboardScores` cache the live surfaces use.
 *   - accountProfitRank — replaced by `accountStatsRank` (richer per-metric
 *     stat breakdown over a window). The wrapper proxies through
 *     `accountStatsRank` with default filters and maps `netPnL` → `totalPnL`.
 *
 *   Each wrapper emits a `logDeprecatedHit` log line so the final
 *   cleanup PR can gate deletion on call-count telemetry.
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { logDeprecatedHit } from '../../../../../lib/deprecationTelemetry';
import { getLeaderboardScores } from '../score';
import { runAccountStatsRank } from '../accountStats';

export const accountAccuracy: NonNullable<
  QueryResolvers['accountAccuracy']
> = async (_parent, { address }) => {
  logDeprecatedHit('accountAccuracy');
  const addr = address.toLowerCase();
  const scores = await getLeaderboardScores();
  const hit = scores.find((s) => s.attester === addr);
  if (!hit) return null;
  // The legacy aggregation counters (numScored / sumErrorSquared /
  // numTimeWeighted / sumTimeWeightedError) were always emitted as zeros from
  // the v1 resolver — keep the same non-load-bearing values here.
  return {
    address: addr,
    accuracyScore: hit.accuracyScore,
    numScored: 0,
    sumErrorSquared: 0,
    numTimeWeighted: 0,
    sumTimeWeightedError: 0,
  };
};

export const accountProfitRank: NonNullable<
  QueryResolvers['accountProfitRank']
> = async (_parent, { address }) => {
  logDeprecatedHit('accountProfitRank');
  const rank = await runAccountStatsRank({ address });
  return {
    address: rank.address,
    rank: rank.rank,
    totalParticipants: rank.totalParticipants,
    totalPnL: rank.netPnL,
  };
};
