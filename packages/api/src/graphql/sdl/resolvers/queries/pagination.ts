/**
 * Shared pagination helpers for `*Page` resolvers.
 *
 * Standard limits across the surface:
 *   - `take` capped at 100 (server-side fan-out budget). Per-resolver
 *     defaults vary (25 for leaderboards, 50 for list pages, 20 for the
 *     activity feed); pass them via `defaultTake` so the clamp can fall
 *     back when callers send invalid input.
 *   - `skip` capped at 1000 by default. `MAX_SKIP` exists to bound
 *     offset-style pagination: a `skip` of e.g. 50_000 forces Postgres
 *     to scan and discard every preceding row, even with the right
 *     index. 1_000 covers every realistic infinite-scroll use case
 *     (max take is 100, so 11 pages deep) while making accidental
 *     deep-skip queries fail-fast rather than silently expensive.
 *     Resolvers with a different access pattern can opt into a higher
 *     ceiling by passing `maxSkip`.
 *
 * Hot paths that need to read further than `MAX_SKIP` should adopt
 * cursor / keyset pagination (`after: String` on `(createdAt, id)`) —
 * the row count returned via `totalCount` is already enough for "X
 * items total" UI badges without paying the offset cost.
 */

export const MAX_TAKE = 100;
export const MAX_SKIP = 1000;

export const clampTake = (
  take: number | null | undefined,
  { defaultTake, maxTake = MAX_TAKE }: { defaultTake: number; maxTake?: number }
): number => {
  const value = take ?? defaultTake;
  if (!Number.isFinite(value) || value <= 0)
    return Math.min(defaultTake, maxTake);
  return Math.max(1, Math.min(Math.floor(value), maxTake));
};

export const clampSkip = (
  skip: number | null | undefined,
  { maxSkip = MAX_SKIP }: { maxSkip?: number } = {}
): number => {
  const value = skip ?? 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), maxSkip);
};
