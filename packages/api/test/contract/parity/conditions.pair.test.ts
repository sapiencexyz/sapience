import { describe, it, expect } from 'vitest';
import { GET_CONDITIONS } from '../fixtures/v1-operations';
import { both, byKey, expectMonotonic, isoToEpochMs } from './util';

/**
 * Parity: v1 `conditions` (GET_CONDITIONS) vs v2 `conditions` connection.
 *
 * Documented differences encoded in the projections below:
 * - v1 `Condition.id` IS the CTF hash; v2 `id` is an opaque Node id and the
 *   hash lives at `conditionId`. Canonical key = the hash.
 * - `public` → `isPublic` rename.
 * - `settled`/`resolvedToYes`/`nonDecisive` exist on both sides (v2 via the
 *   PR #1822 v1-compat fields) and are compared verbatim.
 * - v1 flat `similarMarkets`/`similarMarketImage` → v2 nested
 *   `similarMarket.markets`/`.image` (flat volume mirror kept by #1822).
 * - DROPPED `assertionId`/`assertionTimestamp`: decided absent in v2
 *   (SCHEMA_GAPS G9 — no render site exists).
 * - DROPPED numeric `category.id` / `conditionGroup.id` /
 *   `conditionGroupId`: Prisma row ids are not exposed in v2 by design;
 *   identity is compared via `category.slug` / group `name`.
 * - Ordering: v1's doc bakes in `createdAt desc` (no tie-break); the v2 doc
 *   passes CREATED_AT DESC explicitly (v2 defaults to END_TIME ASC and
 *   tie-breaks on id). Rows compare as a set sorted by hash; each side's
 *   ordering contract is asserted independently.
 * - Visibility: v2 silently defaults to `public: true` when the filter is
 *   omitted (conditionListFilters.ts) while v1 `where: {}` returns private
 *   rows too — so BOTH sides filter public explicitly.
 */

const V2_CONDITIONS = /* GraphQL */ `
  query ConditionsParity($first: Int!) {
    conditions(
      first: $first
      orderBy: { field: CREATED_AT, direction: DESC }
      filter: { public: true }
    ) {
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
        estimatedPrice
        similarMarketVolume
        similarMarket {
          image
          markets
        }
        conditionGroup {
          name
        }
        category {
          name
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
  optionName: string | null;
  endTime: number;
  isPublic: boolean;
  description: string;
  chainId: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string;
  estimatedPrice: number | null;
  similarMarketVolume: number;
  similarMarketImage: string | null;
  similarMarkets: string[];
  groupName: string | null;
  categoryName: string | null;
  categorySlug: string | null;
}

/** The fields each side's response actually carries (per its query doc). */
interface V1Row {
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
  estimatedPrice: number | null;
  similarMarketVolume: number;
  similarMarketImage: string | null;
  conditionGroup: { name: string } | null;
  category: { name: string; slug: string } | null;
}

interface V2Row {
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
  estimatedPrice: number | null;
  similarMarketVolume: number;
  similarMarket: { image: string | null; markets: string[] } | null;
  conditionGroup: { name: string } | null;
  category: { name: string; slug: string } | null;
}

// Coercions below are documented per the README policy:
// - .toLowerCase() on hashes/addresses: the v2 SDL guarantees lowercase
//   0x-hex (Condition.conditionId doc) while v1 casing is resolver-
//   dependent; casing is not part of the consumer contract (every consumer
//   compares case-insensitively or lowercases first).
// - BigInt(openInterest).toString(): the VALUE is the contract; the wire
//   representation (string vs number) differs between v1 BigInt scalar
//   serialization and v2's.
// - Number(endTime): v1 Int vs v2 UnixSeconds — same unit, numeric compare.
const projectV1 = (rows: V1Row[]): Canonical[] =>
  byKey(
    rows.map(
      (c): Canonical => ({
        conditionId: c.id.toLowerCase(),
        createdAtMs: isoToEpochMs(c.createdAt),
        question: c.question,
        shortName: c.shortName ?? null,
        optionName: c.optionName ?? null,
        endTime: Number(c.endTime),
        isPublic: c.public,
        description: c.description,
        chainId: c.chainId,
        resolver: c.resolver ? c.resolver.toLowerCase() : null,
        settled: c.settled,
        resolvedToYes: c.resolvedToYes,
        nonDecisive: c.nonDecisive,
        openInterest: BigInt(c.openInterest).toString(),
        estimatedPrice: c.estimatedPrice ?? null,
        similarMarketVolume: c.similarMarketVolume,
        similarMarketImage: c.similarMarketImage ?? null,
        similarMarkets: c.similarMarkets,
        groupName: c.conditionGroup?.name ?? null,
        categoryName: c.category?.name ?? null,
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
        optionName: c.optionName ?? null,
        endTime: Number(c.endTime),
        isPublic: c.isPublic,
        description: c.description,
        chainId: c.chainId,
        resolver: c.resolver ? c.resolver.toLowerCase() : null,
        settled: c.settled,
        resolvedToYes: c.resolvedToYes,
        nonDecisive: c.nonDecisive,
        openInterest: BigInt(c.openInterest).toString(),
        estimatedPrice: c.estimatedPrice ?? null,
        similarMarketVolume: c.similarMarketVolume,
        similarMarketImage: c.similarMarket?.image ?? null,
        similarMarkets: c.similarMarket?.markets ?? [],
        groupName: c.conditionGroup?.name ?? null,
        categoryName: c.category?.name ?? null,
        categorySlug: c.category?.slug ?? null,
      })
    ),
    (c) => c.conditionId
  );

describe('parity: conditions list', () => {
  it('v2 conditions(first:25, CREATED_AT DESC, public) matches v1 GET_CONDITIONS(take:25, public)', async () => {
    const [d1, d2] = await both<
      { conditions: V1Row[] },
      { conditions: { nodes: V2Row[] } }
    >(
      {
        query: GET_CONDITIONS,
        variables: { take: 25, skip: 0, where: { public: { equals: true } } },
      },
      { query: V2_CONDITIONS, variables: { first: 25 } }
    );

    const v1 = projectV1(d1.conditions);
    const v2 = projectV2(d2.conditions.nodes);

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
