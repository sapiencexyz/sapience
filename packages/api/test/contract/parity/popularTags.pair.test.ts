import { describe, it, expect } from 'vitest';
import { GET_POPULAR_TAGS } from '../fixtures/v1-operations';
import { both, expectMonotonic } from './util';

/**
 * Parity: v1 `popularTags: [String!]!` (top-20, rank order) vs v2 `tags`
 * connection of `Tag { name, conditionCount }` (default CONDITION_COUNT
 * DESC, first: 20 — the same canonical feed).
 *
 * Documented differences encoded below:
 * - Shape: bare strings → Tag nodes. Canonical = the name list.
 * - Tie order: v1 returns the keeper-materialized rank order; v2 orders by
 *   count with a deterministic NAME tie-break (OPEN_BUGS #15 fix). Equal-
 *   count tags can therefore interleave differently, so membership is
 *   compared as a sorted set and v2's count ordering is asserted
 *   independently.
 */

const V2_TAGS = /* GraphQL */ `
  query PopularTagsParity {
    tags(first: 20, orderBy: { field: CONDITION_COUNT, direction: DESC }) {
      nodes {
        name
        conditionCount
      }
    }
  }
`;

describe('parity: popular tags', () => {
  it('v2 tags(first:20) matches v1 popularTags membership', async () => {
    const [d1, d2] = await both<
      { popularTags: string[] },
      { tags: { nodes: Array<{ name: string; conditionCount: number }> } }
    >({ query: GET_POPULAR_TAGS }, { query: V2_TAGS });

    const v1 = [...d1.popularTags].sort();
    const v2 = d2.tags.nodes.map((t) => t.name).sort();

    expect(v2.length).toBe(v1.length);
    expect(v2).toEqual(v1);

    expectMonotonic(
      d2.tags.nodes.map((t) => t.conditionCount),
      'desc'
    );
  });
});
