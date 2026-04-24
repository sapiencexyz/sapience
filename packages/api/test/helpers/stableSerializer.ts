/**
 * Normalizes volatile fields in GraphQL responses so `toMatchFileSnapshot`
 * produces stable diffs across test runs.
 *
 * - Any value that matches an ISO 8601 datetime becomes `<ISO_TIMESTAMP>`.
 *   Catches `createdAt`/`updatedAt`/`settledAt`/time-bucketed snapshot
 *   timestamps driven by `now()` in resolvers. We normalize by *value
 *   shape* rather than field name so we don't miss newly added timestamp
 *   fields during a rewrite.
 * - Any numeric field that looks like a seconds-since-epoch timestamp
 *   within a few hours of now is normalized too, catching
 *   `nextResolveAtEpoch`-style fields. Everything else passes through.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const TIMESTAMP_FIELD_NAMES = new Set<string>([
  'timestamp',
  'createdAt',
  'updatedAt',
  'settledAt',
  'resolvedAt',
  'executedAt',
  'burnedAt',
  'redeemedAt',
  'collateralDepositedAt',
  'time',
  'assertionTimestamp',
]);

const stabilizeValue = (key: string | undefined, value: unknown): unknown => {
  if (typeof value === 'string' && ISO_DATE_RE.test(value)) {
    return '<ISO_TIMESTAMP>';
  }
  if (
    typeof value === 'number' &&
    key !== undefined &&
    TIMESTAMP_FIELD_NAMES.has(key) &&
    Number.isInteger(value) &&
    value > 1_000_000_000 // anything past ~2001-09 is probably a timestamp
  ) {
    return '<UNIX_TIMESTAMP>';
  }
  return stabilize(value);
};

export const stabilize = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((v) => stabilizeValue(undefined, v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = stabilizeValue(key, v);
    }
    return out as unknown as T;
  }
  return value;
};
