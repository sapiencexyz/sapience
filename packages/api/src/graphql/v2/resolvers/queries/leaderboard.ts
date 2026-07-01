/**
 * `Query.leaderboard` — Relay-shaped account ranking by metric.
 *
 * The cursor is an offset (the ranked set is materialized in-memory by
 * the time we slice, so keyset paging buys nothing). `Account.rank`
 * reuses `rankedAccountsForMetric` from `./accountStats` so the two
 * surfaces share one ordered set.
 */

import type {
  AccountResolvers,
  QueryResolvers,
} from '../../__generated__/resolvers';
import { LeaderboardMetric } from '../../__generated__/resolvers';
import { decodeCursor, encodeCursor } from '../../relay/cursor';
import { clampTake } from '../../relay/pagination';
import { synthesizeAccount } from '../accountSynthesis';
import { rankedAccountsForMetric } from './accountStats';

/**
 * Project a ranked `(address, value)` row into a `Ranking` node, placing
 * the value in its native-typed field for the metric in play and leaving
 * the others null. PNL / VOLUME values are wUSDe wei (→ BigInt);
 * ACCURACY / ROI are ratios (→ Float).
 */
const toRankingNode = (
  entry: { address: string; value: string },
  rank: number,
  metric: LeaderboardMetric
) => ({
  account: synthesizeAccount(entry.address),
  rank,
  accuracy: metric === LeaderboardMetric.Accuracy ? Number(entry.value) : null,
  pnl: metric === LeaderboardMetric.Pnl ? BigInt(entry.value) : null,
  volume: metric === LeaderboardMetric.Volume ? BigInt(entry.value) : null,
  roi: metric === LeaderboardMetric.Roi ? Number(entry.value) : null,
});

export const leaderboard: NonNullable<QueryResolvers['leaderboard']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 25, {
    defaultTake: 25,
    maxTake: 25,
  });
  const offsetPayload = args.after ? decodeCursor(args.after) : null;
  const start =
    offsetPayload && /^\d+$/.test(offsetPayload.k)
      ? Number(offsetPayload.k) + 1
      : 0;

  const ranked = await rankedAccountsForMetric(args.metric, {
    timestamp: args.filter?.timestamp ?? null,
  });

  const slice = ranked.slice(start, start + first);
  const nodes = slice.map((entry, index) =>
    toRankingNode(entry, start + index + 1, args.metric)
  );
  const edges = nodes.map((node, index) => ({
    node,
    cursor: encodeCursor({
      k: String(start + index),
      id: node.account.address,
    }),
  }));

  return {
    metric: args.metric,
    edges,
    nodes,
    totalCount: ranked.length,
    pageInfo: {
      hasNextPage: start + slice.length < ranked.length,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  } as never;
};

export const accountRank: NonNullable<AccountResolvers['ranking']> = async (
  parent,
  args
) => {
  const address = (
    (parent as { address?: string }).address ?? ''
  ).toLowerCase();
  if (!address) return null;
  const ranked = await rankedAccountsForMetric(args.metric, {
    timestamp: args.filter?.timestamp ?? null,
  });
  const index = ranked.findIndex(
    (entry) => entry.address.toLowerCase() === address
  );
  if (index < 0) return null;
  return toRankingNode(ranked[index], index + 1, args.metric) as never;
};
