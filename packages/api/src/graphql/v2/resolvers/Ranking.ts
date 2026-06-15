/**
 * `Ranking` field resolvers.
 *
 * `pnlFormatted` is a convenience projection of the `pnl` field: the v2
 * `Ranking.pnl` is wUSDe wei (BigInt), but leaderboard/profile consumers
 * want the v1-shaped pre-scaled decimal string so they don't each call
 * `formatUnits(pnl, 18)` themselves (and risk an off-by-1e18 bug). We
 * scale it down once here, in the resolver that owns the unit.
 *
 * The `pnl` field is only populated when the ranking was queried with the
 * PNL metric (see `toRankingNode` in `./queries/leaderboard`); for other
 * metrics it is null, and the schema-required (`String!`) formatted value
 * is the zero string `"0"`.
 */

import { formatUnits } from 'viem';
import type { RankingResolvers } from '../__generated__/resolvers';

// wUSDe carries 18 decimals — same scale used across protocolStats.
const WUSDE_DECIMALS = 18;

type RankingParent = { pnl?: bigint | null };

const pnlFormatted = (parent: RankingParent): string =>
  formatUnits(parent.pnl ?? 0n, WUSDE_DECIMALS);

// `pnlFormatted` is appended to the SDL `Ranking` type; the cast bridges
// until the generated `RankingResolvers` is regenerated to include it.
export const Ranking = {
  pnlFormatted,
} as RankingResolvers;
