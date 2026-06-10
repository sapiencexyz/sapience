import { describe, it, expect } from 'vitest';
import { GET_CATEGORIES } from '../fixtures/v1-operations';
import { both, byKey } from './util';

/**
 * Parity: v1 `categories` (bare array) vs v2 `categories` connection.
 *
 * Documented differences encoded in the projections below:
 * - DROPPED numeric `Category.id`: a Prisma row id, not exposed in v2 by
 *   design (PLAN.md identity model). Identity is the `slug`.
 * - v1 has no declared ordering; v2 defaults to NAME ASC. Rows compare as a
 *   set sorted by slug.
 */

const V2_CATEGORIES = /* GraphQL */ `
  query CategoriesParity {
    categories(first: 100) {
      nodes {
        name
        slug
      }
    }
  }
`;

interface Canonical {
  name: string;
  slug: string;
}

describe('parity: categories', () => {
  it('v2 categories(first:100) matches v1 GET_CATEGORIES', async () => {
    const [d1, d2] = await both<
      { categories: Array<{ id: number; name: string; slug: string }> },
      { categories: { nodes: Canonical[] } }
    >({ query: GET_CATEGORIES }, { query: V2_CATEGORIES });

    const v1 = byKey(
      d1.categories.map(({ name, slug }): Canonical => ({ name, slug })),
      (c) => c.slug
    );
    const v2 = byKey(
      d2.categories.nodes.map(({ name, slug }): Canonical => ({ name, slug })),
      (c) => c.slug
    );

    expect(v2.length).toBe(v1.length);
    expect(v2).toEqual(v1);
  });
});
