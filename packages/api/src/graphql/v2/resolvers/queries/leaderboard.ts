/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `Query.leaderboard` — Relay-shaped account ranking by metric.
 *
 * Delegates the ranking math to v1's `rankedAccountsForMetric` helper
 * (PnL/Volume/ROI window aggregation, Accuracy lifetime score). Slices
 * the materialized ranking with an offset cursor — the ranked set is
 * fully in-memory by the time we slice, so keyset paging buys nothing.
 */

import { LeaderboardMetric } from '../../../sdl/__generated__/resolvers';
import { rankedAccountsForMetric } from '../../../sdl/resolvers/queries/leaderboard';
import { synthesizeAccount } from '../../../sdl/resolvers/accountSynthesis';
import { decodeCursor, encodeCursor } from '../../../relay/cursor';
import { clampTake } from '../../../sdl/resolvers/queries/pagination';

const V2_TO_V1_METRIC: Record<string, LeaderboardMetric> = {
  ACCURACY: LeaderboardMetric.Accuracy,
  PNL: LeaderboardMetric.Pnl,
  VOLUME: LeaderboardMetric.Volume,
  ROI: LeaderboardMetric.Roi,
};

type Args = {
  metric: keyof typeof V2_TO_V1_METRIC;
  first?: number | null;
  after?: string | null;
  filter?: {
    timestamp?: { gte?: number | null; lte?: number | null } | null;
  } | null;
};

export const leaderboard = async (_parent: unknown, args: Args) => {
  const first = clampTake(args.first ?? 25, {
    defaultTake: 25,
    maxTake: 100,
  });
  const offsetPayload = args.after ? decodeCursor(args.after) : null;
  const start =
    offsetPayload && /^\d+$/.test(offsetPayload.k)
      ? Number(offsetPayload.k) + 1
      : 0;

  const ranked = await rankedAccountsForMetric(V2_TO_V1_METRIC[args.metric], {
    timestamp: args.filter?.timestamp ?? null,
  });

  const slice = ranked.slice(start, start + first);
  const nodes = slice.map((entry, index) => ({
    account: synthesizeAccount(entry.address),
    rank: start + index + 1,
    value: entry.value,
  }));
  const edges = nodes.map((node, index) => ({
    node,
    cursor: encodeCursor({
      k: String(start + index),
      id: (node.account as { address: string }).address,
    }),
  }));

  return {
    metric: args.metric,
    edges,
    nodes,
    totalCount: ranked.length,
    pageInfo: {
      hasNextPage: start + slice.length < ranked.length,
      hasPreviousPage: start > 0,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  };
};

/**
 * Account.rank field resolver — looks up the parent address in the
 * ranked set and returns the rank, or null when unranked.
 */
export const accountRank = async (
  parent: { address?: string | null },
  args: { metric: keyof typeof V2_TO_V1_METRIC; filter?: Args['filter'] | null }
) => {
  const address = (parent.address ?? '').toLowerCase();
  if (!address) return null;
  const ranked = await rankedAccountsForMetric(V2_TO_V1_METRIC[args.metric], {
    timestamp: args.filter?.timestamp ?? null,
  });
  const index = ranked.findIndex(
    (entry) => entry.address.toLowerCase() === address
  );
  if (index < 0) return null;
  return {
    account: synthesizeAccount(address),
    rank: index + 1,
    value: ranked[index].value,
  };
};
