/**
 * Shared pagination clamps for `*Page` resolvers.
 *
 * `MAX_SKIP` exists to bound offset-style pagination: a `skip` of e.g.
 * 50_000 forces Postgres to scan and discard every preceding row, even
 * with the right index. 1_000 covers every realistic infinite-scroll
 * use case (max take is 100, so 11 pages deep) while making accidental
 * deep-skip queries fail-fast rather than silently expensive.
 *
 * Hot paths that need to read further than this should adopt cursor /
 * keyset pagination (`after: String` on `(createdAt, id)`) — the row
 * count returned via `totalCount` is already enough for "X items
 * total" UI badges without paying the offset cost.
 */
export const MAX_SKIP = 1000;

export const clampSkip = (skip: number | null | undefined): number => {
  const value = skip ?? 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_SKIP);
};

export const clampTake = (
  take: number | null | undefined,
  { defaultTake, maxTake }: { defaultTake: number; maxTake: number }
): number => {
  const value = take ?? defaultTake;
  if (!Number.isFinite(value) || value <= 0)
    return Math.min(defaultTake, maxTake);
  return Math.max(1, Math.min(Math.floor(value), maxTake));
};
