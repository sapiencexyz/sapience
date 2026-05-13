/**
 * Shared coercion helper for the analytics surface's `fromEpoch` / `toEpoch`
 * wire args. Callers pass whatever they have on hand — a `Date`, an ISO
 * string, an already-computed epoch-seconds Int, or `null`/`undefined` —
 * and the SDK normalizes to `Int | null` for the GraphQL variable.
 *
 * Note: `number` inputs pass through unchanged on the assumption that they
 * are already in seconds. Passing `Date.now()` (milliseconds) would silently
 * yield a far-future epoch — call sites that interop with JS timestamps
 * should `Math.floor(ms / 1000)` first or pass a `Date`.
 */
export const toEpochOrNull = (
  v?: Date | string | number | null
): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const d = v instanceof Date ? v : new Date(v);
  return Math.floor(d.getTime() / 1000);
};
