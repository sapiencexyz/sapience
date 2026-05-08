/**
 * Deprecated PnL queries:
 *
 *   - profitLeaderboard — replaced by `profitLeaderboardPage`.
 *   - accountProfitRank — unused; will be removed.
 *
 * Both share `getFullLeaderboard` and `sliceLeaderboard` from the live
 * file (single TtlCache instance keeps the warm path coherent).
 */

import type { QueryResolvers } from '../../../__generated__/resolvers';
import { getFullLeaderboard, sliceLeaderboard } from '../pnl';

export const profitLeaderboard: NonNullable<
  QueryResolvers['profitLeaderboard']
> = async (_parent, { limit, skip }) => {
  const { items } = await sliceLeaderboard(limit, skip);
  return items;
};

export const accountProfitRank: NonNullable<
  QueryResolvers['accountProfitRank']
> = async (_parent, { address }) => {
  const leaderboard = await getFullLeaderboard();
  const lc = address.toLowerCase();
  const totalParticipants = leaderboard.length;
  const idx = leaderboard.findIndex((e) => e.address === lc);
  return {
    address: lc,
    totalPnL: idx >= 0 ? leaderboard[idx].totalPnL : '0',
    rank: idx >= 0 ? idx + 1 : null,
    totalParticipants,
  };
};
