/**
 * Shared pagination helpers for `*Page` resolvers.
 *
 * Standard limits across the surface:
 *   - `take` capped at 100 (server-side fan-out budget). Per-resolver
 *     defaults vary (25 for leaderboards, 50 for list pages, 20 for the
 *     activity feed); pass them via `defaultTake` so the clamp can fall
 *     back when callers send invalid input.
 *   - `skip` capped at 1000 (deep paging is signal of a different
 *     access pattern — cursor-based scan instead of skip).
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

export const clampSkip = (skip: number | null | undefined): number => {
  const value = skip ?? 0;
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_SKIP);
};
