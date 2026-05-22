/**
 * Opaque cursor encoding for forward-only Relay-shaped connections.
 *
 * Each cursor encodes the position of a row in a sorted feed as the
 * tuple `(orderKey, id)`. The tie-breaker `id` matters because most
 * order keys (`OPEN_INTEREST`, `PREDICTION_COUNT`, `RESOLVES_AT`, …)
 * aren't unique across rows; without it, two rows with identical
 * order-key values would either both be skipped or both be returned
 * depending on the SQL ordering of the second key, breaking page
 * continuity.
 *
 * Cursors are intentionally opaque — clients must treat them as
 * unparseable strings. The on-wire format here is base64url so
 * cursors survive URL encoding and HTTP header transit without
 * additional escaping.
 *
 * Decoding is permissive about format errors (returns `null` rather
 * than throwing) so a malformed `after:` argument from a client
 * resolves to "no cursor" — same effect as a fresh request — rather
 * than a query crash. Resolvers can still reject explicitly if
 * stricter semantics are desired.
 */

export type CursorPayload = {
  /** The order-key value of the row (stringified). */
  k: string;
  /** Stable row identifier — the tie-breaker. */
  id: string;
};

const isCursorPayload = (value: unknown): value is CursorPayload => {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.k === 'string' && typeof obj.id === 'string';
};

/** Encode an order-key + id pair into an opaque base64url cursor. */
export const encodeCursor = (payload: CursorPayload): string =>
  Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');

/**
 * Decode an opaque cursor back into its `(orderKey, id)` payload.
 * Returns `null` for malformed input — callers treat that as
 * "no cursor" rather than erroring out.
 */
export const decodeCursor = (cursor: string): CursorPayload | null => {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const parsed = JSON.parse(json);
    return isCursorPayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
