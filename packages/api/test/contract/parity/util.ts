/**
 * Shared helpers for the v1↔v2 parity suite. Deliberately tiny — a pair
 * file is self-contained (its projections ARE the documentation of what v2
 * changed), and these helpers only cover the mechanics every pair repeats.
 */

import { expect } from 'vitest';
import { executeOperation } from '../../helpers/testApollo';
import { executeOperationV2 } from '../../helpers/testApolloV2';

interface Op {
  query: string;
  variables?: Record<string, unknown>;
}

/**
 * Run a v1/v2 operation pair against the shared fixture DB. Fails the test
 * with the full error payload if either side errors — a GraphQL-level
 * failure (unknown field, bad enum, …) should never read as a data diff.
 */
export const both = async <D1 = unknown, D2 = unknown>(
  v1: Op,
  v2: Op
): Promise<[D1, D2]> => {
  const [r1, r2] = await Promise.all([
    executeOperation<D1>(v1.query, v1.variables),
    executeOperationV2<D2>(v2.query, v2.variables),
  ]);
  expect(r1.errors, `v1 errors: ${JSON.stringify(r1.errors)}`).toBeUndefined();
  expect(r2.errors, `v2 errors: ${JSON.stringify(r2.errors)}`).toBeUndefined();
  return [r1.data as D1, r2.data as D2];
};

/** Sort a projection by its domain key so rows compare as a set. */
export const byKey = <T>(arr: T[], key: (t: T) => string): T[] =>
  [...arr].sort((a, b) => key(a).localeCompare(key(b)));

/**
 * Format-agnostic (Z vs +00:00) but LOSSLESS: epoch milliseconds, no
 * truncation — flooring to seconds would mask a sub-second serializer
 * precision regression between the two endpoints.
 */
export const isoToEpochMs = (iso: string): number => Date.parse(iso);

/**
 * Assert a numeric sequence honors its declared sort direction (ties
 * allowed). Used on each side's RAW response order — cross-endpoint order
 * equality is never asserted (v1 has no tie-break; v2 tie-breaks on id).
 */
export const expectMonotonic = (xs: number[], dir: 'asc' | 'desc'): void => {
  for (let i = 1; i < xs.length; i += 1) {
    if (dir === 'desc') expect(xs[i]).toBeLessThanOrEqual(xs[i - 1]);
    else expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
  }
};
