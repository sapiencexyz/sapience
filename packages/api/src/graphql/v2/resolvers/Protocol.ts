/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * `Query.protocol` — singleton entry point for protocol-wide stats and
 * breakdowns. Delegates to v1's stats helpers; v2's `Protocol.stats`
 * wraps the same fat-row pipeline in a forward-only Relay connection
 * with offset cursors (the rows are already materialized in memory).
 */

import { encodeCursor, decodeCursor } from '../../relay/cursor';
import { clampTake } from '../../sdl/resolvers/queries/pagination';
import {
  protocolStats as v1ProtocolStats,
  openInterestByCategory as v1OIByCategory,
  openInterestByTimeToResolution as v1OIByTTR,
} from '../../sdl/resolvers/queries/analytics';

export const protocol = async () => ({});

export const Protocol = {
  stats: async (
    _parent: unknown,
    args: {
      filter?: {
        timestamp?: { gte?: number | null; lte?: number | null } | null;
      } | null;
      first?: number | null;
      after?: string | null;
    }
  ) => {
    const rows = await (v1ProtocolStats as any)(null, {
      from: args.filter?.timestamp?.gte ?? undefined,
      to: args.filter?.timestamp?.lte ?? undefined,
    });
    const first = clampTake(args.first ?? rows.length, {
      defaultTake: rows.length || 100,
      maxTake: 1000,
    });
    const after = args.after ? decodeCursor(args.after) : null;
    const start = after && /^\d+$/.test(after.k) ? Number(after.k) + 1 : 0;
    const slice = rows.slice(start, start + first);
    const edges = slice.map((node: any, idx: number) => ({
      node,
      cursor: encodeCursor({
        k: String(start + idx),
        id: String(node.timestamp),
      }),
    }));
    return {
      edges,
      nodes: slice,
      totalCount: rows.length,
      pageInfo: {
        hasNextPage: start + slice.length < rows.length,
        hasPreviousPage: start > 0,
        startCursor: edges[0]?.cursor ?? null,
        endCursor: edges[edges.length - 1]?.cursor ?? null,
      },
    };
  },

  openInterestByCategory: () => (v1OIByCategory as any)(),
  openInterestByTimeToResolution: () => (v1OIByTTR as any)(),
};
