/**
 * Shared connection-building primitives for v2 plural-query resolvers.
 *
 * Every plural query in v2 is forward-only Relay-shaped — `first`,
 * `after`, `edges { node, cursor }`, `pageInfo`, `totalCount`. The
 * resolver-by-resolver variation is:
 *
 *   - which Prisma column drives ordering
 *   - whether the column supports a keyset cursor (most do — `Decimal`
 *     / `VarChar`-stored bigints fall back to offset)
 *   - which column is the tie-break id
 *   - how to map the cursor's stringified `k` payload back to a typed
 *     where-clause value
 *
 * This module exposes the two primitives that let the resolvers express
 * those variations cleanly:
 *
 *   - `normalizeDirection` — coerce a raw enum string to `'asc' | 'desc'`
 *   - `buildKeysetWhere` — assemble the canonical `(orderField, idField)`
 *     keyset predicate
 *
 * Final edge/pageInfo assembly flows through `buildConnection` (re-exported
 * here for convenience) in `./pagination.ts`.
 */

export type OrderDirection = 'asc' | 'desc';

export {
  buildConnection,
  clampTake,
  offsetFromCursor,
  timestampCursorArgs,
} from './pagination';
export { decodeCursor, encodeCursor } from './cursor';

/**
 * Coerce a wire-string direction (`"ASC"` / `"DESC"` / undefined) to a
 * Prisma direction, falling back to `fallback` on anything else.
 */
export const normalizeDirection = (
  direction: string | null | undefined,
  fallback: OrderDirection
): OrderDirection => {
  const value = String(direction ?? '').toLowerCase();
  if (value === 'asc') return 'asc';
  if (value === 'desc') return 'desc';
  return fallback;
};

/**
 * Build the canonical Relay keyset cursor predicate:
 *
 *   (orderField <op> orderValue)
 *     OR (orderField = orderValue AND idField <op> idValue)
 *
 * where `<op>` is `lt` for DESC and `gt` for ASC. Returns the where
 * fragment as `Record<string, unknown>` — callers cast to their
 * specific `Prisma.*WhereInput`. The dynamic field names defeat
 * Prisma's structural types, so the cast is unavoidable; centralizing
 * the construction here keeps the unsafe coercion in one place.
 */
export const buildKeysetWhere = <TWhere>({
  orderField,
  orderValue,
  idField,
  idValue,
  direction,
}: {
  orderField: string;
  orderValue: unknown;
  idField: string;
  idValue: unknown;
  direction: OrderDirection;
}): TWhere => {
  const op = direction === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { [orderField]: { [op]: orderValue } },
      {
        AND: [
          { [orderField]: { equals: orderValue } },
          { [idField]: { [op]: idValue } },
        ],
      },
    ],
  } as TWhere;
};

/**
 * Combine a base where with an optional keyset cursor where. When the
 * cursor is `null` (no `after:` supplied) returns the base unchanged.
 */
export const withCursorWhere = <TWhere>(
  baseWhere: TWhere,
  cursorWhere: TWhere | null
): TWhere =>
  cursorWhere
    ? ({ AND: [baseWhere, cursorWhere] } as unknown as TWhere)
    : baseWhere;
