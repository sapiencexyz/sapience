import { describe, it, expect } from 'vitest';
import { GET_CONDITIONS } from '../fixtures/v1-operations';
import { both, byKey, expectMonotonic, isoToEpochMs } from './util';

/**
 * Parity: v1 `conditions` search (GET_CONDITIONS + hand-built Prisma
 * `where` OR over question/shortName/description + category-slug IN) vs
 * v2 `conditions(filter: { search, categorySlugs })` (G7).
 *
 * GATES the conditions consumer flip: search surfaces (ConditionSelect,
 * condition browse) must match shortName-only hits before migrating.
 *
 * Search term `cle/tor` (lowercase on purpose — exercises insensitive
 * matching on both sides): in the frozen fixture it appears ONLY in
 * `shortName` ("CLE/TOR 1H O107.5", …); the matching rows' question /
 * description say "Cavaliers vs Raptors". A non-empty result therefore
 * proves the v2 search predicate covers shortName, not just
 * question/description.
 *
 * Documented differences encoded in the projection:
 * - v1 `Condition.id` IS the CTF hash; v2 `id` is an opaque Node id and
 *   the hash lives at `conditionId`. Canonical key = the hash.
 * - Visibility is explicit on BOTH sides per the README rule.
 * - Ordering: both docs pin createdAt DESC; v2 additionally tie-breaks
 *   on id, so rows compare as a set sorted by hash and each side's
 *   ordering contract is asserted independently.
 */

const SEARCH_TERM = 'cle/tor';
const CATEGORY_SLUGS = ['sports'];

const V2_CONDITIONS_SEARCH = /* GraphQL */ `
  query ConditionsSearchParity(
    $first: Int!
    $search: String!
    $categorySlugs: [String!]!
  ) {
    conditions(
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
      filter: { search: $search, categorySlugs: $categorySlugs, public: true }
    ) {
      nodes {
        conditionId
        createdAt
        question
        shortName
        category {
          slug
        }
      }
    }
  }
`;

interface Canonical {
  conditionId: string;
  createdAtMs: number;
  question: string;
  shortName: string | null;
  categorySlug: string | null;
}

interface V1Row {
  id: string;
  createdAt: string;
  question: string;
  shortName: string | null;
  category: { slug: string } | null;
}

interface V2Row {
  conditionId: string;
  createdAt: string;
  question: string;
  shortName: string | null;
  category: { slug: string } | null;
}

// .toLowerCase() on the hash: v2 SDL guarantees lowercase 0x-hex; v1
// casing is resolver-dependent and not part of the consumer contract.
const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (c): Canonical => ({
        conditionId: c.id.toLowerCase(),
        createdAtMs: isoToEpochMs(c.createdAt),
        question: c.question,
        shortName: c.shortName ?? null,
        categorySlug: c.category?.slug ?? null,
      })
    ),
    (c) => c.conditionId
  );

const projectV2 = (rows: V2Row[]): Canonical[] =>
  byKey(
    rows.map(
      (c): Canonical => ({
        conditionId: c.conditionId.toLowerCase(),
        createdAtMs: isoToEpochMs(c.createdAt),
        question: c.question,
        shortName: c.shortName ?? null,
        categorySlug: c.category?.slug ?? null,
      })
    ),
    (c) => c.conditionId
  );

describe('parity: conditions search (G7)', () => {
  it('v2 conditions(search + categorySlugs) matches v1 GET_CONDITIONS with OR question/shortName/description + slug IN', async () => {
    const contains = { contains: SEARCH_TERM, mode: 'insensitive' };
    const [d1, d2] = await both<
      { conditions: V1Row[] },
      { conditions: { nodes: V2Row[] } }
    >(
      {
        query: GET_CONDITIONS,
        variables: {
          take: 50,
          skip: 0,
          // Mirrors the app-side v1 search where-builder: OR-contains over
          // question/shortName/description, AND public + category slug IN.
          where: {
            OR: [
              { question: contains },
              { shortName: contains },
              { description: contains },
            ],
            public: { equals: true },
            category: { is: { slug: { in: CATEGORY_SLUGS } } },
          },
        },
      },
      {
        query: V2_CONDITIONS_SEARCH,
        variables: {
          first: 50,
          search: SEARCH_TERM,
          categorySlugs: CATEGORY_SLUGS,
        },
      }
    );

    const v1 = projectV1(d1.conditions);
    const v2 = projectV2(d2.conditions.nodes);

    // Fixture has shortName-only hits — an empty page means the v2 search
    // predicate is NOT covering shortName.
    expect(v1.length).toBeGreaterThan(0);
    expect(v2.length).toBe(v1.length);
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);

    // Each side honors its own ordering contract (raw, pre-sort order).
    expectMonotonic(
      d1.conditions.map((c) => isoToEpochMs(c.createdAt)),
      'desc'
    );
    expectMonotonic(
      d2.conditions.nodes.map((c) => isoToEpochMs(c.createdAt)),
      'desc'
    );
  });
});
