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
import { decodeCursor, encodeCursor } from '../../relay/cursor';
import { clampTake } from '../../relay/pagination';
import { synthesizeAccount } from '../accountSynthesis';
import { rankedAccountsForMetric } from './accountStats';

export const leaderboard: NonNullable<QueryResolvers['leaderboard']> = async (
  _parent,
  args
) => {
  const first = clampTake(args.first ?? 25, {
    defaultTake: 25,
    maxTake: 100,
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
  const nodes = slice.map((entry, index) => ({
    account: synthesizeAccount(entry.address),
    rank: start + index + 1,
    value: entry.value,
  }));
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
  return {
    account: synthesizeAccount(address),
    rank: index + 1,
    value: ranked[index].value,
  } as never;
};
