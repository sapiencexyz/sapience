/**
 * Shared pagination helpers for `*Page` resolvers.
 *
 * Standard limits across the analytics surface:
 *   - `take` capped at 100 (server-side fan-out budget)
 *   - `skip` capped at 1000 (deep paging is signal of a different access
 *     pattern — cursor-based scan instead of skip)
 *
 * `wantsTotalCount` lets the resolver populate `totalCount` only when the
 * client actually selected it — otherwise we leave it null to avoid the
 * incremental cost.
 */

import type { GraphQLResolveInfo } from 'graphql';

export const MAX_TAKE = 100;
export const MAX_SKIP = 1000;

export const clampTake = (n: number): number =>
  Math.max(1, Math.min(n, MAX_TAKE));

export const clampSkip = (n: number): number =>
  Math.max(0, Math.min(n, MAX_SKIP));

/** Did the client select `totalCount` on this `*Page` field? */
export const wantsTotalCount = (info: GraphQLResolveInfo): boolean => {
  const sel = info.fieldNodes[0]?.selectionSet?.selections ?? [];
  return sel.some(
    (s) =>
      s.kind === 'Field' &&
      (s as { name: { value: string } }).name.value === 'totalCount'
  );
};
