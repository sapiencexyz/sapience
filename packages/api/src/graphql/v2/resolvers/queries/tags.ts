/**
 * `Query.tags` — Relay connection over the keeper-refreshed
 * `popular_tag` materialization.
 *
 * The materialized set is small (currently capped at the top ~20 by
 * usage in `refreshPopularTags`); paging happens in-memory after the
 * single `findMany`. Defaults match the legacy `popularTags` semantic
 * (`CONDITION_COUNT DESC`, first 20) so a default query returns the
 * same canonical popular-tags feed.
 */

import prisma from '../../../../core/db';
import { CACHE_HINTS, setCacheHint } from '../../cacheHints';
import { decodeCursor, encodeCursor } from '../../relay/cursor';
import { clampTake } from '../../relay/pagination';
import type { QueryResolvers } from '../../__generated__/resolvers';

export type TagRow = { name: string; conditionCount: number };

export const tags: NonNullable<QueryResolvers['tags']> = async (
  _parent,
  args,
  _ctx,
  info
) => {
  setCacheHint(info, CACHE_HINTS.STABLE_FIVE_MINUTES);

  const first = clampTake(args.first ?? 20, {
    defaultTake: 20,
    maxTake: 100,
  });
  const field = args.orderBy?.field ?? 'CONDITION_COUNT';
  const direction =
    String(args.orderBy?.direction ?? 'DESC').toLowerCase() === 'asc'
      ? 'asc'
      : 'desc';

  // ≤20 rows in practice — pull the whole materialization, sort + slice
  // in memory rather than encoding a keyset over `(count, tag)`.
  const rows = await prisma.popularTag.findMany();
  const sorted: TagRow[] = rows
    .map((r) => ({ name: r.tag, conditionCount: r.count }))
    .sort((a, b) => {
      if (field === 'NAME') {
        return direction === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      }
      const diff = a.conditionCount - b.conditionCount;
      return direction === 'asc' ? diff : -diff;
    });

  const cursor = args.after ? decodeCursor(args.after) : null;
  const start = cursor && /^\d+$/.test(cursor.k) ? Number(cursor.k) + 1 : 0;
  const slice = sorted.slice(start, start + first);
  const edges = slice.map((node, i) => ({
    node,
    cursor: encodeCursor({ k: String(start + i), id: node.name }),
  }));

  return {
    edges,
    nodes: slice,
    totalCount: sorted.length,
    pageInfo: {
      hasNextPage: start + slice.length < sorted.length,
      hasPreviousPage: false,
      startCursor: edges[0]?.cursor ?? null,
      endCursor: edges[edges.length - 1]?.cursor ?? null,
    },
  } as never;
};
