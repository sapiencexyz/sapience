import { describe, it, expect } from 'vitest';
import { GET_QUESTIONS } from '../fixtures/v1-operations';
import { executeOperationV2 } from '../../helpers/testApolloV2';
import { both, byKey, expectMonotonic, isoToEpochMs } from './util';

/**
 * Parity: v1 `questions` (GET_QUESTIONS) vs v2 `questions` union
 * connection (QuestionItem = Condition | ConditionGroup).
 *
 * Documented differences encoded in the projections below:
 * - v1 wraps each row in a `Question` envelope (`questionType` +
 *   `condition`/`group`); v2 returns the discriminated entity directly.
 *   Canonical kind = `__typename` (v1 `condition`→Condition,
 *   `group`→ConditionGroup); canonical key = CTF `conditionId` for
 *   Condition items, group `name` for group items.
 * - DROPPED numeric `group.id` / `category.id`: Prisma row ids are not
 *   exposed in v2 by design (PLAN.md identity model). v1's numeric
 *   `conditionGroupId` is kept only as a `hasGroup` boolean — v2 carries
 *   the same bit as `conditionGroup != null` (the unwrapped
 *   single-condition-group items keep hasGroup=true on both sides).
 * - DROPPED `assertionId`/`assertionTimestamp`: decided absent in v2
 *   (SCHEMA_GAPS G9 — no render site exists).
 * - `public` → `isPublic` rename; v1 flat `similarMarkets`/
 *   `similarMarketImage` → v2 nested `similarMarket.markets`/`.image`
 *   (flat volume mirrors kept by #1822).
 * - Sort vocabulary: v1 camelCase (`openInterest`, `endTime`) → v2
 *   SCREAMING_SNAKE (`OPEN_INTEREST`, `END_TIME`). The consumer default
 *   is `openInterest desc` (useInfiniteQuestions @ 7799f7764).
 * - Ordering: UNLIKE other pairs, raw order is compared ELEMENT-WISE.
 *   Both endpoints delegate to the same `runQuestionsData` SQL UNION
 *   (v2/resolvers/queries/questions.ts), whose ORDER BY is total
 *   (sort_value, end_time, item_type, group_id, condition_id) — a
 *   sequence diff is a delegation regression, not a tie-break artifact.
 *   Nested group conditions still compare as a SET by conditionId (v1
 *   hydration has no within-displayOrder tie-break; v2 ties on
 *   createdAt/id).
 * - Visibility: `questions` exposes no `public` arg on either side; both
 *   force `public = true` in SQL parts A/B and in the nested condition
 *   hydration/connection. Stated here per the README explicit-visibility
 *   rule.
 * - `QuestionConnection` is edges+pageInfo ONLY (no nodes/totalCount —
 *   the UNION can't COUNT cheaply); pinned via introspection below.
 *   hasNextPage parity: v1 has no flag, so the v1 side over-fetches
 *   take = N+1 and derives it.
 * - KNOWN DIVERGENCE (test skip-marked below, not projected around):
 *   with a per-condition filter active (e.g. minEndTime), v1 hydrates a
 *   group's nested `conditions` through the feed's condition-where
 *   (sdl questions.ts `buildConditionWhere` → hydrateItems include), so
 *   the group card lists only MATCHING conditions; v2's union node
 *   resolves `ConditionGroup.conditions` independently and returns ALL
 *   public conditions of the group (v2/resolvers/ConditionGroup.ts).
 *   The filterless/search/category variants compared here reduce both
 *   wheres to {public:true}, so membership agrees everywhere else.
 */

const V2_QUESTIONS = /* GraphQL */ `
  query QuestionsParity(
    $first: Int!
    $filter: QuestionFilter
    $orderBy: QuestionOrder!
  ) {
    questions(first: $first, filter: $filter, orderBy: $orderBy) {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          __typename
          ... on Condition {
            conditionId
            createdAt
            question
            shortName
            endTime
            isPublic
            description
            tags
            chainId
            resolver
            settled
            resolvedToYes
            nonDecisive
            openInterest
            estimatedPrice
            similarMarketVolume
            similarMarketVolume1h
            similarMarketVolume4h
            similarMarketVolume24h
            similarMarketVolume7d
            similarMarketVolumeFiltered1h
            similarMarketVolumeFiltered4h
            similarMarketVolumeFiltered24h
            similarMarketVolumeFiltered7d
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
          ... on ConditionGroup {
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
                tags
                chainId
                resolver
                settled
                resolvedToYes
                nonDecisive
                openInterest
                estimatedPrice
                similarMarketVolume
                similarMarketVolume1h
                similarMarketVolume4h
                similarMarketVolume24h
                similarMarketVolume7d
                similarMarketVolumeFiltered1h
                similarMarketVolumeFiltered4h
                similarMarketVolumeFiltered24h
                similarMarketVolumeFiltered7d
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
                displayOrder
              }
            }
          }
        }
      }
    }
  }
`;

interface CanonCondition {
  conditionId: string;
  createdAtMs: number;
  question: string;
  shortName: string | null;
  endTime: number;
  isPublic: boolean;
  description: string;
  similarMarkets: string[];
  tags: string[];
  chainId: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string;
  estimatedPrice: number | null;
  similarMarketVolume: number;
  vol1h: number;
  vol4h: number;
  vol24h: number;
  vol7d: number;
  volF1h: number;
  volF4h: number;
  volF24h: number;
  volF7d: number;
  similarMarketImage: string | null;
  hasGroup: boolean;
  categoryName: string | null;
  categorySlug: string | null;
}

interface CanonNestedCondition extends CanonCondition {
  optionName: string | null;
  displayOrder: number | null;
}

type CanonItem =
  | { kind: 'Condition'; key: string; condition: CanonCondition }
  | {
      kind: 'ConditionGroup';
      key: string;
      group: {
        name: string;
        createdAtMs: number;
        categoryName: string | null;
        categorySlug: string | null;
        conditions: CanonNestedCondition[];
      };
    };

/** Fields shared by the v1 top-level `condition` and nested blocks. */
interface V1ConditionCommon {
  id: string;
  createdAt: string;
  question: string;
  shortName: string | null;
  endTime: number;
  public: boolean;
  description: string;
  similarMarkets: string[];
  tags: string[];
  chainId: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string | number;
  estimatedPrice: number | null;
  similarMarketVolume: number;
  similarMarketImage: string | null;
  similarMarketVolume1h: number;
  similarMarketVolume4h: number;
  similarMarketVolume24h: number;
  similarMarketVolume7d: number;
  similarMarketVolumeFiltered1h: number;
  similarMarketVolumeFiltered4h: number;
  similarMarketVolumeFiltered24h: number;
  similarMarketVolumeFiltered7d: number;
  conditionGroupId: number | null;
  category: { id: number; name: string; slug: string } | null;
}
interface V1NestedCondition extends V1ConditionCommon {
  optionName: string | null;
  displayOrder: number | null;
}
interface V1Question {
  questionType: 'condition' | 'group';
  condition: V1ConditionCommon | null;
  group: {
    id: number;
    createdAt: string;
    name: string;
    category: { id: number; name: string; slug: string } | null;
    conditions: V1NestedCondition[];
  } | null;
}

interface V2ConditionCommon {
  conditionId: string;
  createdAt: string;
  question: string;
  shortName: string | null;
  endTime: number;
  isPublic: boolean;
  description: string;
  tags: string[];
  chainId: number;
  resolver: string | null;
  settled: boolean;
  resolvedToYes: boolean;
  nonDecisive: boolean;
  openInterest: string | number;
  estimatedPrice: number | null;
  similarMarketVolume: number;
  similarMarketVolume1h: number;
  similarMarketVolume4h: number;
  similarMarketVolume24h: number;
  similarMarketVolume7d: number;
  similarMarketVolumeFiltered1h: number;
  similarMarketVolumeFiltered4h: number;
  similarMarketVolumeFiltered24h: number;
  similarMarketVolumeFiltered7d: number;
  similarMarket: { image: string | null; markets: string[] } | null;
  conditionGroup: { name: string } | null;
  category: { name: string; slug: string } | null;
}
interface V2NestedCondition extends V2ConditionCommon {
  optionName: string | null;
  displayOrder: number | null;
}
type V2Node =
  | ({ __typename: 'Condition' } & V2ConditionCommon)
  | {
      __typename: 'ConditionGroup';
      name: string;
      createdAt: string;
      category: { name: string; slug: string } | null;
      conditions: { nodes: V2NestedCondition[] };
    };

// Coercions per the README policy: .toLowerCase() on hashes/addresses
// (v2 guarantees lowercase; casing not part of the contract);
// BigInt(openInterest).toString() (value compare across BigInt scalar
// serializers); Number(endTime) (Int vs UnixSeconds, same unit).
const projectV1Condition = (c: V1ConditionCommon): CanonCondition => ({
  conditionId: c.id.toLowerCase(),
  createdAtMs: isoToEpochMs(c.createdAt),
  question: c.question,
  shortName: c.shortName ?? null,
  endTime: Number(c.endTime),
  isPublic: c.public, // `public` → `isPublic` rename
  description: c.description,
  similarMarkets: c.similarMarkets,
  tags: c.tags,
  chainId: c.chainId,
  resolver: c.resolver ? c.resolver.toLowerCase() : null,
  settled: c.settled,
  resolvedToYes: c.resolvedToYes,
  nonDecisive: c.nonDecisive,
  openInterest: BigInt(c.openInterest).toString(),
  estimatedPrice: c.estimatedPrice ?? null,
  similarMarketVolume: c.similarMarketVolume,
  vol1h: c.similarMarketVolume1h,
  vol4h: c.similarMarketVolume4h,
  vol24h: c.similarMarketVolume24h,
  vol7d: c.similarMarketVolume7d,
  volF1h: c.similarMarketVolumeFiltered1h,
  volF4h: c.similarMarketVolumeFiltered4h,
  volF24h: c.similarMarketVolumeFiltered24h,
  volF7d: c.similarMarketVolumeFiltered7d,
  similarMarketImage: c.similarMarketImage ?? null,
  // numeric conditionGroupId DROPPED → presence bit only (see header).
  hasGroup: c.conditionGroupId != null,
  categoryName: c.category?.name ?? null,
  categorySlug: c.category?.slug ?? null,
});

const projectV2Condition = (c: V2ConditionCommon): CanonCondition => ({
  conditionId: c.conditionId.toLowerCase(),
  createdAtMs: isoToEpochMs(c.createdAt),
  question: c.question,
  shortName: c.shortName ?? null,
  endTime: Number(c.endTime),
  isPublic: c.isPublic,
  description: c.description,
  similarMarkets: c.similarMarket?.markets ?? [],
  tags: c.tags,
  chainId: c.chainId,
  resolver: c.resolver ? c.resolver.toLowerCase() : null,
  settled: c.settled,
  resolvedToYes: c.resolvedToYes,
  nonDecisive: c.nonDecisive,
  openInterest: BigInt(c.openInterest).toString(),
  estimatedPrice: c.estimatedPrice ?? null,
  similarMarketVolume: c.similarMarketVolume,
  vol1h: c.similarMarketVolume1h,
  vol4h: c.similarMarketVolume4h,
  vol24h: c.similarMarketVolume24h,
  vol7d: c.similarMarketVolume7d,
  volF1h: c.similarMarketVolumeFiltered1h,
  volF4h: c.similarMarketVolumeFiltered4h,
  volF24h: c.similarMarketVolumeFiltered24h,
  volF7d: c.similarMarketVolumeFiltered7d,
  similarMarketImage: c.similarMarket?.image ?? null,
  hasGroup: c.conditionGroup != null,
  categoryName: c.category?.name ?? null,
  categorySlug: c.category?.slug ?? null,
});

/** ORDER-PRESERVING — raw order is comparable here (shared runner). */
const projectV1 = (qs: V1Question[]): CanonItem[] =>
  qs.map((q): CanonItem => {
    if (q.questionType === 'condition' && q.condition) {
      return {
        kind: 'Condition',
        key: q.condition.id.toLowerCase(),
        condition: projectV1Condition(q.condition),
      };
    }
    const g = q.group!;
    return {
      kind: 'ConditionGroup',
      key: g.name,
      group: {
        name: g.name,
        createdAtMs: isoToEpochMs(g.createdAt),
        categoryName: g.category?.name ?? null,
        categorySlug: g.category?.slug ?? null,
        conditions: byKey(
          g.conditions.map((c) => ({
            ...projectV1Condition(c),
            optionName: c.optionName ?? null,
            displayOrder: c.displayOrder ?? null,
          })),
          (c) => c.conditionId
        ),
      },
    };
  });

const projectV2 = (nodes: V2Node[]): CanonItem[] =>
  nodes.map((n): CanonItem => {
    if (n.__typename === 'Condition') {
      return {
        kind: 'Condition',
        key: n.conditionId.toLowerCase(),
        condition: projectV2Condition(n),
      };
    }
    return {
      kind: 'ConditionGroup',
      key: n.name,
      group: {
        name: n.name,
        createdAtMs: isoToEpochMs(n.createdAt),
        categoryName: n.category?.name ?? null,
        categorySlug: n.category?.slug ?? null,
        conditions: byKey(
          n.conditions.nodes.map((c) => ({
            ...projectV2Condition(c),
            optionName: c.optionName ?? null,
            displayOrder: c.displayOrder ?? null,
          })),
          (c) => c.conditionId
        ),
      },
    };
  });

type V1Data = { questions: V1Question[] };
type V2Data = {
  questions: { pageInfo: { hasNextPage: boolean }; edges: { node: V2Node }[] };
};

const runPair = (
  v1Vars: Record<string, unknown>,
  v2Vars: Record<string, unknown>
) =>
  both<V1Data, V2Data>(
    { query: GET_QUESTIONS, variables: v1Vars },
    { query: V2_QUESTIONS, variables: v2Vars }
  );

const itemKeys = (items: CanonItem[]): string[] =>
  items.map((i) => `${i.kind}:${i.key}`);

/** Per-item end-time the runner sorts by: condition endTime, group max. */
const itemEndTime = (i: CanonItem): number =>
  i.kind === 'Condition'
    ? i.condition.endTime
    : Math.max(...i.group.conditions.map((c) => c.endTime));

describe('parity: questions feed (union connection)', () => {
  it('OPEN_INTEREST DESC (consumer default sort) page matches element-wise', async () => {
    const [d1, d2] = await runPair(
      { take: 12, skip: 0, sortField: 'openInterest', sortDirection: 'desc' },
      { first: 12, orderBy: { field: 'OPEN_INTEREST', direction: 'DESC' } }
    );

    const v1 = projectV1(d1.questions);
    const v2 = projectV2(d2.questions.edges.map((e) => e.node));

    expect(v1.length).toBe(12); // fixture sanity — full page, not vacuous
    // Keys first for a readable diff, then the full per-variant fields.
    expect(itemKeys(v2)).toEqual(itemKeys(v1));
    // v1 is `expected`: a failing diff reads as "v2 deviates from v1".
    expect(v2).toEqual(v1);
  });

  it('END_TIME ASC page matches element-wise; per-item end-time monotonic', async () => {
    const [d1, d2] = await runPair(
      { take: 12, skip: 0, sortField: 'endTime', sortDirection: 'asc' },
      { first: 12, orderBy: { field: 'END_TIME', direction: 'ASC' } }
    );

    const v1 = projectV1(d1.questions);
    const v2 = projectV2(d2.questions.edges.map((e) => e.node));

    expect(v1.length).toBe(12);
    expect(itemKeys(v2)).toEqual(itemKeys(v1));
    expect(v2).toEqual(v1);

    // Each side honors the declared sort on its own raw order (group sort
    // key = max public condition endTime; fixture aggregates verified
    // fresh against the trigger-maintained columns).
    expectMonotonic(v1.map(itemEndTime), 'asc');
    expectMonotonic(v2.map(itemEndTime), 'asc');
  });

  it('search narrows identically (search: "bitcoin")', async () => {
    const [d1, d2] = await runPair(
      {
        take: 50,
        skip: 0,
        sortField: 'endTime',
        sortDirection: 'asc',
        search: 'bitcoin',
      },
      {
        first: 50,
        filter: { search: 'bitcoin' },
        orderBy: { field: 'END_TIME', direction: 'ASC' },
      }
    );

    const v1 = projectV1(d1.questions);
    const v2 = projectV2(d2.questions.edges.map((e) => e.node));

    expect(v1.length).toBeGreaterThan(0); // fixture: 22 public matches
    expect(itemKeys(v2)).toEqual(itemKeys(v1));
    expect(v2).toEqual(v1);
  });

  it('categorySlugs filter matches (crypto + sports)', async () => {
    const slugs = ['crypto', 'sports'];
    const [d1, d2] = await runPair(
      {
        take: 12,
        skip: 0,
        sortField: 'openInterest',
        sortDirection: 'desc',
        categorySlugs: slugs,
      },
      {
        first: 12,
        filter: { categorySlugs: slugs },
        orderBy: { field: 'OPEN_INTEREST', direction: 'DESC' },
      }
    );

    const v1 = projectV1(d1.questions);
    const v2 = projectV2(d2.questions.edges.map((e) => e.node));

    expect(v1.length).toBeGreaterThan(0);
    expect(itemKeys(v2)).toEqual(itemKeys(v1));
    expect(v2).toEqual(v1);

    // The filter actually bites: every surfaced item is in the slug set.
    for (const i of v1) {
      const slug =
        i.kind === 'Condition' ? i.condition.categorySlug : i.group.categorySlug;
      expect(slugs).toContain(slug);
    }
  });

  it('hasNextPage parity: v1 take N+1 over-fetch vs v2 pageInfo.hasNextPage', async () => {
    // True branch: the unfiltered feed has far more than 12 items.
    const [d1, d2] = await runPair(
      { take: 13, skip: 0, sortField: 'openInterest', sortDirection: 'desc' },
      { first: 12, orderBy: { field: 'OPEN_INTEREST', direction: 'DESC' } }
    );
    expect(d2.questions.pageInfo.hasNextPage).toBe(d1.questions.length > 12);
    expect(d2.questions.pageInfo.hasNextPage).toBe(true);
    // Shared total order ⇒ the over-fetch prefix is exactly v2's page.
    expect(itemKeys(projectV2(d2.questions.edges.map((e) => e.node)))).toEqual(
      itemKeys(projectV1(d1.questions.slice(0, 12)))
    );

    // False branch: the bitcoin search set fits in one page.
    const [s1, s2] = await runPair(
      {
        take: 51,
        skip: 0,
        sortField: 'endTime',
        sortDirection: 'asc',
        search: 'bitcoin',
      },
      {
        first: 50,
        filter: { search: 'bitcoin' },
        orderBy: { field: 'END_TIME', direction: 'ASC' },
      }
    );
    expect(s2.questions.pageInfo.hasNextPage).toBe(s1.questions.length > 50);
    expect(s2.questions.pageInfo.hasNextPage).toBe(false);
  });

  it('QuestionConnection is edges + pageInfo ONLY (no nodes/totalCount)', async () => {
    const res = await executeOperationV2<{
      __type: { fields: { name: string }[] } | null;
    }>(/* GraphQL */ `
      query {
        __type(name: "QuestionConnection") {
          fields {
            name
          }
        }
      }
    `);
    expect(res.errors).toBeUndefined();
    const names = (res.data?.__type?.fields ?? []).map((f) => f.name).sort();
    expect(names).toEqual(['edges', 'pageInfo']);
  });

  // Was a REAL DIVERGENCE (caught 2026-06-10): v1 narrows a surfaced
  // group's nested `conditions` to the rows matching the feed filter
  // (minEndTime here) via hydrateItems' attached `condition` array, while
  // v2's union node re-fetched ALL public conditions of the group (4 vs
  // 22 on the fixture's "Peru Presidential Election" group). Fixed: the
  // v2 ConditionGroup.conditions resolver now honors a feed-attached
  // hydrated array exactly like v1's resolver — this test is the
  // regression pin.
  it('minEndTime filter: nested group membership matches', async () => {
    const [d1, d2] = await runPair(
      {
        take: 10,
        skip: 0,
        sortField: 'endTime',
        sortDirection: 'asc',
        search: 'Peru',
        minEndTime: 1777000000,
      },
      {
        first: 10,
        filter: { search: 'Peru', endsAt: { gte: 1777000000 } },
        orderBy: { field: 'END_TIME', direction: 'ASC' },
      }
    );

    const v1 = projectV1(d1.questions);
    const v2 = projectV2(d2.questions.edges.map((e) => e.node));
    expect(v1.length).toBeGreaterThan(0);
    expect(v2).toEqual(v1);
  });
});
