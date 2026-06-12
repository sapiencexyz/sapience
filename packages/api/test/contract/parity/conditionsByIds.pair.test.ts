import { describe, it, expect, beforeAll } from 'vitest';
import { CONDITIONS_BY_IDS_QUERY } from '../fixtures/v1-operations';
import prisma from '../../../src/core/db';
import { both, byKey } from './util';

/**
 * Parity: v1 `conditions(where:{id:{in}})` (CONDITIONS_BY_IDS_QUERY, the
 * `fetchConditionsByIds` SDK contract) vs v2 `conditions(filter:{conditionIds})`.
 *
 * Documented differences encoded in the projections below:
 * - v1 `Condition.id` IS the CTF hash; v2 moves it to `conditionId`.
 * - v1 flat `similarMarkets` → v2 nested `similarMarket.markets` (#1822).
 * - `settled`/`resolvedToYes`/`nonDecisive` compared verbatim (v2 #1822
 *   v1-compat fields).
 * - DROPPED numeric `category.id`-style fields: none selected here; category
 *   identity compares via `slug` (the only field the consumer selects).
 * - Visibility: the v2 by-ids path deliberately SKIPS the public:true
 *   default (conditionListFilters.ts — `conditionIds` present disables it),
 *   matching v1's unfiltered `where`. Public hashes are harvested anyway so
 *   the pair is insensitive to that rule either way.
 * - Ordering: by-ids consumers treat the result as a set (v1 op has no
 *   orderBy → DB order); the v2 doc still passes an explicit orderBy per
 *   suite policy. No order assertion — there is no v1 ordering contract.
 */

const V2_CONDITIONS_BY_IDS = /* GraphQL */ `
  query ConditionsByIdsParity($ids: [Bytes!]!) {
    conditions(
      first: 100
      filter: { conditionIds: $ids }
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        conditionId
        shortName
        optionName
        question
        description
        endTime
        resolver
        settled
        resolvedToYes
        nonDecisive
        estimatedPrice
        similarMarket {
          markets
        }
        category {
          slug
        }
      }
    }
  }
`;

interface Canonical {
  conditionId: string;
  shortName: string | null;
  optionName: string | null;
  question: string;
  description: string;
  endTime: number;
  resolver: string | null;
  similarMarkets: string[];
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  estimatedPrice: number | null;
  categorySlug: string | null;
}

interface V1Row {
  id: string;
  shortName: string | null;
  optionName: string | null;
  question: string;
  description: string;
  endTime: number;
  resolver: string | null;
  similarMarkets: string[];
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  estimatedPrice: number | null;
  category: { slug: string } | null;
}

interface V2Row {
  conditionId: string;
  shortName: string | null;
  optionName: string | null;
  question: string;
  description: string;
  endTime: number;
  resolver: string;
  similarMarket: { markets: string[] } | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  estimatedPrice: number | null;
  category: { slug: string } | null;
}

// .toLowerCase() on hash/address: v2 SDL guarantees lowercase 0x-hex; v1
// casing is resolver-dependent and not part of the consumer contract.
const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (c): Canonical => ({
        conditionId: c.id.toLowerCase(),
        shortName: c.shortName ?? null,
        optionName: c.optionName ?? null,
        question: c.question,
        description: c.description,
        endTime: Number(c.endTime), // v1 Int vs v2 UnixSeconds — same unit
        resolver: c.resolver ? c.resolver.toLowerCase() : null,
        similarMarkets: c.similarMarkets,
        settled: c.settled,
        resolvedToYes: c.resolvedToYes,
        nonDecisive: c.nonDecisive,
        estimatedPrice: c.estimatedPrice ?? null,
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
        shortName: c.shortName ?? null,
        optionName: c.optionName ?? null,
        question: c.question,
        description: c.description,
        endTime: Number(c.endTime),
        resolver: c.resolver ? c.resolver.toLowerCase() : null,
        similarMarkets: c.similarMarket?.markets ?? [],
        settled: c.settled,
        resolvedToYes: c.resolvedToYes,
        nonDecisive: c.nonDecisive,
        estimatedPrice: c.estimatedPrice ?? null,
        categorySlug: c.category?.slug ?? null,
      })
    ),
    (c) => c.conditionId
  );

describe('parity: conditions by ids', () => {
  // Harvested from the shared fixture DB rather than pinned, so a fixture
  // refresh keeps the pair exercising real hashes.
  let hashes: string[] = [];

  beforeAll(async () => {
    const rows = await prisma.condition.findMany({
      where: { public: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true },
    });
    hashes = rows.map((r) => r.id);
    expect(hashes).toHaveLength(5); // fixture sanity — not vacuous
  });

  it('v2 conditions(filter:{conditionIds}) matches v1 where:{id:{in}} row-for-row', async () => {
    const [d1, d2] = await both<
      { conditions: V1Row[] },
      { conditions: { nodes: V2Row[] } }
    >(
      {
        query: CONDITIONS_BY_IDS_QUERY,
        variables: { where: { id: { in: hashes } } },
      },
      { query: V2_CONDITIONS_BY_IDS, variables: { ids: hashes } }
    );

    const v1 = projectV1(d1.conditions);
    const v2 = projectV2(d2.conditions.nodes);

    expect(v1).toHaveLength(5); // every harvested hash must round-trip
    expect(v2).toHaveLength(5);
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);
  });
});
