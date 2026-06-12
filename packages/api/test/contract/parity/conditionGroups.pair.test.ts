import { describe, it, expect } from 'vitest';
import { GET_CONDITION_GROUPS } from '../fixtures/v1-operations';
import { both, byKey, expectMonotonic, isoToEpochMs } from './util';

/**
 * Parity: v1 `conditionGroups` (GET_CONDITION_GROUPS) vs v2
 * `conditionGroups` connection with nested `conditions(first:50)`.
 *
 * Documented differences encoded in the projections below:
 * - DROPPED numeric `ConditionGroup.id` / `category.id` / nested
 *   `conditionGroupId`: Prisma row ids are not exposed in v2 by design.
 *   Groups key on `name` (unique across the fixture's 50 groups; v2 global
 *   id encodes the row id but is opaque); nested conditions key on the CTF
 *   hash (`id` → `conditionId`).
 * - DROPPED `assertionId`/`assertionTimestamp`: decided absent in v2
 *   (SCHEMA_GAPS G9 / plan A11 — drop from queries).
 * - v1 flat `similarMarkets`/`similarMarketImage` → v2 nested
 *   `similarMarket` (+ flat `similarMarketVolume` mirror kept by #1822).
 * - Visibility — REAL DIVERGENCE, test skipped: v1's field resolver ALWAYS
 *   forces `public: true` on nested conditions, even with no `where`
 *   ("hidden conditions never leak", sdl/resolvers/ConditionGroup.ts:48-56).
 *   v2's resolver fetches every row by `conditionGroupId` with NO visibility
 *   filter and no filter argument (v2/resolvers/ConditionGroup.ts:85-94), so
 *   private conditions LEAK through v2 (fixture: isPublic:false rows for
 *   e.g. 0x0b5c2b2b… / 0x15076260… in the Elon-tweet-count group appear in
 *   v2 only; groups 21158/27470/27478 all carry private rows). Not
 *   encodable as a projection — that would paper over a visibility
 *   regression. Server fix wanted: v2 nested conditions must filter
 *   public:true (or grow an explicit filter), then unskip.
 * - Ordering: groups CREATED_AT DESC explicit on v2 (matches the v1 op's
 *   baked-in `createdAt desc`); nested conditions are displayOrder ASC on
 *   both sides (v1 op arg; v2 resolver-fixed, then createdAt/id) with SQL
 *   NULLS LAST — each side's non-null displayOrder prefix is asserted.
 */

const V2_CONDITION_GROUPS = /* GraphQL */ `
  query ConditionGroupsParity($first: Int!) {
    conditionGroups(
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
    ) {
      nodes {
        name
        createdAt
        category {
          name
          slug
        }
        conditions(first: 50) {
          nodes {
            conditionId
            createdAt
            question
            shortName
            optionName
            endTime
            isPublic
            description
            chainId
            resolver
            settled
            resolvedToYes
            nonDecisive
            openInterest
            similarMarketVolume
            similarMarket {
              image
              markets
            }
            estimatedPrice
            category {
              name
              slug
            }
            displayOrder
          }
        }
      }
    }
  }
`;

interface CanonicalCondition {
  conditionId: string;
  createdAtMs: number;
  question: string;
  shortName: string | null;
  optionName: string | null;
  endTime: number;
  isPublic: boolean;
  description: string;
  similarMarkets: string[];
  chainId: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string;
  similarMarketVolume: number;
  similarMarketImage: string | null;
  estimatedPrice: number | null;
  categoryName: string | null;
  categorySlug: string | null;
  displayOrder: number | null;
}

interface CanonicalGroup {
  name: string;
  createdAtMs: number;
  categoryName: string | null;
  categorySlug: string | null;
  conditions: CanonicalCondition[];
}

interface V1Condition {
  id: string;
  createdAt: string;
  question: string;
  shortName: string | null;
  optionName: string | null;
  endTime: number;
  public: boolean;
  description: string;
  similarMarkets: string[];
  chainId: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string | number;
  similarMarketVolume: number;
  similarMarketImage: string | null;
  estimatedPrice: number | null;
  category: { name: string; slug: string } | null;
  displayOrder: number | null;
}

interface V1Group {
  name: string;
  createdAt: string;
  category: { name: string; slug: string } | null;
  conditions: V1Condition[];
}

interface V2Condition {
  conditionId: string;
  createdAt: string;
  question: string;
  shortName: string | null;
  optionName: string | null;
  endTime: number;
  isPublic: boolean;
  description: string;
  chainId: number;
  resolver: string;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string | number;
  similarMarketVolume: number;
  similarMarket: { image: string | null; markets: string[] } | null;
  estimatedPrice: number | null;
  category: { name: string; slug: string } | null;
  displayOrder: number | null;
}

interface V2Group {
  name: string;
  createdAt: string;
  category: { name: string; slug: string } | null;
  conditions: { nodes: V2Condition[] };
}

// Coercions: lowercase hashes/addresses (v2 guarantees lowercase; casing not
// part of the contract); BigInt(openInterest).toString() (value compare —
// v1/v2 BigInt scalar wire representation differs); Number(endTime).
const projectV1Condition = (c: V1Condition): CanonicalCondition => ({
  conditionId: c.id.toLowerCase(),
  createdAtMs: isoToEpochMs(c.createdAt),
  question: c.question,
  shortName: c.shortName ?? null,
  optionName: c.optionName ?? null,
  endTime: Number(c.endTime),
  isPublic: c.public, // `public` → `isPublic` rename
  description: c.description,
  similarMarkets: c.similarMarkets,
  chainId: c.chainId,
  resolver: c.resolver ? c.resolver.toLowerCase() : null,
  settled: c.settled,
  resolvedToYes: c.resolvedToYes,
  nonDecisive: c.nonDecisive,
  openInterest: BigInt(c.openInterest).toString(),
  similarMarketVolume: c.similarMarketVolume,
  similarMarketImage: c.similarMarketImage ?? null,
  estimatedPrice: c.estimatedPrice ?? null,
  categoryName: c.category?.name ?? null,
  categorySlug: c.category?.slug ?? null,
  displayOrder: c.displayOrder ?? null,
});

const projectV2Condition = (c: V2Condition): CanonicalCondition => ({
  conditionId: c.conditionId.toLowerCase(),
  createdAtMs: isoToEpochMs(c.createdAt),
  question: c.question,
  shortName: c.shortName ?? null,
  optionName: c.optionName ?? null,
  endTime: Number(c.endTime),
  isPublic: c.isPublic,
  description: c.description,
  similarMarkets: c.similarMarket?.markets ?? [],
  chainId: c.chainId,
  resolver: c.resolver ? c.resolver.toLowerCase() : null,
  settled: c.settled,
  resolvedToYes: c.resolvedToYes,
  nonDecisive: c.nonDecisive,
  openInterest: BigInt(c.openInterest).toString(),
  similarMarketVolume: c.similarMarketVolume,
  similarMarketImage: c.similarMarket?.image ?? null,
  estimatedPrice: c.estimatedPrice ?? null,
  categoryName: c.category?.name ?? null,
  categorySlug: c.category?.slug ?? null,
  displayOrder: c.displayOrder ?? null,
});

const projectGroup = (
  name: string,
  createdAt: string,
  category: { name: string; slug: string } | null,
  conditions: CanonicalCondition[]
): CanonicalGroup => ({
  name,
  createdAtMs: isoToEpochMs(createdAt),
  categoryName: category?.name ?? null,
  categorySlug: category?.slug ?? null,
  conditions: byKey(conditions, (c) => c.conditionId),
});

/** Non-null displayOrder prefix must be ascending on the RAW order. */
const expectDisplayOrderContract = (orders: (number | null)[]): void => {
  expectMonotonic(
    orders.filter((d): d is number => d != null),
    'asc'
  );
};

const runPair = () =>
  both<{ conditionGroups: V1Group[] }, { conditionGroups: { nodes: V2Group[] } }>(
    // where/conditionsWhere omitted — see Visibility note in the header.
    { query: GET_CONDITION_GROUPS, variables: { take: 100, skip: 0 } },
    { query: V2_CONDITION_GROUPS, variables: { first: 100 } }
  );

describe('parity: condition groups', () => {
  it('group-level fields match (nested conditions quarantined below)', async () => {
    const [d1, d2] = await runPair();

    // Group rows only — nested conditions are compared (and currently
    // skipped) separately so the visibility divergence doesn't take the
    // whole domain's group-surface pin down with it.
    const v1 = byKey(
      d1.conditionGroups.map((g) =>
        projectGroup(g.name, g.createdAt, g.category, [])
      ),
      (g) => g.name
    );
    const v2 = byKey(
      d2.conditionGroups.nodes.map((g) =>
        projectGroup(g.name, g.createdAt, g.category, [])
      ),
      (g) => g.name
    );

    expect(v1.length).toBeGreaterThan(0); // fixture sanity — not vacuous
    expect(v2.length).toBe(v1.length);
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);

    // Group ordering contract, each side's raw order.
    expectMonotonic(
      d1.conditionGroups.map((g) => isoToEpochMs(g.createdAt)),
      'desc'
    );
    expectMonotonic(
      d2.conditionGroups.nodes.map((g) => isoToEpochMs(g.createdAt)),
      'desc'
    );

    // Nested ordering contract holds on each side independently even while
    // the membership diverges (displayOrder asc, NULLS LAST on both sides).
    for (const g of d1.conditionGroups)
      expectDisplayOrderContract(g.conditions.map((c) => c.displayOrder));
    for (const g of d2.conditionGroups.nodes)
      expectDisplayOrderContract(g.conditions.nodes.map((c) => c.displayOrder));
  });

  // v2 ConditionGroup.conditions now force-filters public rows exactly
  // like v1 (sdl/resolvers/ConditionGroup.ts "hidden conditions never
  // leak") — the leak this test originally caught is fixed in the v2
  // resolver, so it runs unskipped as the regression pin.
  it('nested conditions match per group', async () => {
    const [d1, d2] = await runPair();

    const v1 = byKey(
      d1.conditionGroups.map((g) =>
        projectGroup(
          g.name,
          g.createdAt,
          g.category,
          g.conditions.map(projectV1Condition)
        )
      ),
      (g) => g.name
    );
    const v2 = byKey(
      d2.conditionGroups.nodes.map((g) =>
        projectGroup(
          g.name,
          g.createdAt,
          g.category,
          g.conditions.nodes.map(projectV2Condition)
        )
      ),
      (g) => g.name
    );

    expect(v2).toEqual(v1); // v1 is `expected`
  });
});
