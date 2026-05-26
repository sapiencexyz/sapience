/**
 * `Query.protocol` — singleton entry point for protocol-wide stats and
 * breakdowns. Delegates to v1's stats helpers; v2's `Protocol.stats`
 * wraps the same fat-row pipeline in a forward-only Relay connection
 * with offset cursors (the rows are already materialized in memory).
 */

import type {
  ProtocolResolvers,
  QueryResolvers,
} from '../__generated__/resolvers';
import {
  buildConnection,
  clampTake,
  decodeCursor,
  encodeCursor,
} from '../relay/connection';
import {
  protocolStats as v1ProtocolStats,
  openInterestByCategory as v1OIByCategory,
  openInterestByTimeToResolution as v1OIByTTR,
} from '../../sdl/resolvers/queries/analytics';

type V1Resolver = (parent: null, args: unknown, ctx: unknown) => unknown;

export const protocol: NonNullable<QueryResolvers['protocol']> = () =>
  ({}) as never;

export const Protocol: ProtocolResolvers = {
  stats: async (_parent, args) => {
    const rows = (await (v1ProtocolStats as unknown as V1Resolver)(
      null,
      {
        from: args.filter?.timestamp?.gte ?? undefined,
        to: args.filter?.timestamp?.lte ?? undefined,
      },
      null
    )) as Array<Record<string, unknown>>;
    const first = clampTake(args.first ?? rows.length, {
      defaultTake: rows.length || 100,
      maxTake: 1000,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const start = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;
    const slice = rows.slice(start, start + first + 1);

    return buildConnection({
      rows: slice as never[],
      first,
      totalCount: rows.length,
      getCursor: (row, idx) =>
        encodeCursor({
          k: String(start + idx),
          id: String((row as { timestamp?: unknown }).timestamp ?? ''),
        }),
    });
  },

  openInterestByCategory: () =>
    (v1OIByCategory as unknown as V1Resolver)(null, {}, null) as never,
  openInterestByTimeToResolution: () =>
    (v1OIByTTR as unknown as V1Resolver)(null, {}, null) as never,
};
