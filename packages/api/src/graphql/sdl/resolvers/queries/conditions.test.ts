import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  condition: { findMany: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryConditionsPageArgs,
  ConditionFilters,
} from '../../__generated__/resolvers';
import { conditionsPage } from './conditions';

type ConditionsPageFn = (
  parent: unknown,
  args: QueryConditionsPageArgs,
  ctx: unknown,
  info: unknown
) => Promise<{ items: unknown[]; hasMore: boolean }>;
const conditionsPageFn = conditionsPage as unknown as ConditionsPageFn;

const callPage = (overrides: Partial<QueryConditionsPageArgs> = {}) =>
  conditionsPageFn(
    undefined,
    {
      take: 50,
      skip: 0,
      filters: null,
      orderBy: null,
      orderDirection: null,
      ...overrides,
    },
    undefined,
    undefined
  );

const whereOf = () =>
  mockPrisma.condition.findMany.mock.calls[0][0].where as Record<
    string,
    unknown
  >;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.condition.findMany.mockResolvedValue([]);
});

describe('conditionsPage — pagination envelope', () => {
  it('caps take at 100 and fetches take + 1 to detect hasMore', async () => {
    await callPage({ take: 9999 });
    const args = mockPrisma.condition.findMany.mock.calls[0][0];
    expect(args.take).toBe(101);
    expect(args.skip).toBe(0);
  });

  it('hasMore=true when probe row is returned', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `c-${i}` }));
    mockPrisma.condition.findMany.mockResolvedValue(eleven);
    const result = await callPage({ take: 10 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it('hasMore=false when fewer than take + 1 rows', async () => {
    mockPrisma.condition.findMany.mockResolvedValue([{ id: 'c-1' }]);
    const result = await callPage({ take: 10 });
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(1);
  });
});

describe('conditionsPage — orderBy mapping', () => {
  it('defaults to createdAt desc', async () => {
    await callPage();
    const args = mockPrisma.condition.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it.each([
    ['CREATED_AT', 'createdAt'],
    ['END_TIME', 'endTime'],
    ['OPEN_INTEREST', 'openInterest'],
    ['PREDICTION_COUNT', 'predictionCount'],
  ] as const)('maps orderBy %s → Prisma %s', async (input, prismaField) => {
    await callPage({ orderBy: input as never });
    const args = mockPrisma.condition.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ [prismaField]: 'desc' });
  });

  it('respects orderDirection asc', async () => {
    await callPage({
      orderBy: 'END_TIME' as never,
      orderDirection: 'asc' as never,
    });
    const args = mockPrisma.condition.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ endTime: 'asc' });
  });

  it('falls back to createdAt for an unknown orderBy value (safety net)', async () => {
    await callPage({ orderBy: 'NOT_A_REAL_FIELD' as never });
    const args = mockPrisma.condition.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
});

describe('conditionsPage — filter construction', () => {
  it('null filters → public-only safety net', async () => {
    await callPage({ filters: null });
    expect(whereOf()).toEqual({ public: { equals: true } });
  });

  it('empty filters object → public-only safety net (visibility default)', async () => {
    await callPage({ filters: {} as ConditionFilters });
    expect(whereOf()).toEqual({
      AND: [{ public: { equals: true } }],
    });
  });

  it('id filter bypasses the public default (admin/direct-link reachability)', async () => {
    await callPage({
      filters: { ids: ['0xABC', '0xDEF'] } as ConditionFilters,
    });
    const where = whereOf();
    // Visibility filter must be absent.
    expect(JSON.stringify(where)).not.toContain('"public"');
    expect(where.AND).toContainEqual({ id: { in: ['0xabc', '0xdef'] } });
  });

  it('explicit visibility=PRIVATE flips the public filter', async () => {
    await callPage({
      filters: { visibility: 'PRIVATE' } as ConditionFilters,
    });
    expect(whereOf().AND).toContainEqual({ public: { equals: false } });
  });

  it('visibility=ALL omits the public filter entirely', async () => {
    await callPage({ filters: { visibility: 'ALL' } as ConditionFilters });
    const where = whereOf();
    expect(JSON.stringify(where)).not.toContain('"public"');
  });

  it('chainId filter is wrapped in equals', async () => {
    await callPage({ filters: { chainId: 8453 } as ConditionFilters });
    expect(whereOf().AND).toContainEqual({ chainId: { equals: 8453 } });
  });

  it('lower-cases the resolver address', async () => {
    await callPage({
      filters: { resolver: '0xRESOLVER' } as ConditionFilters,
    });
    expect(whereOf().AND).toContainEqual({
      resolver: { equals: '0xresolver' },
    });
  });

  it('lower-cases each entry in resolverIn', async () => {
    await callPage({
      filters: { resolverIn: ['0xAAA', '0xBBB'] } as ConditionFilters,
    });
    expect(whereOf().AND).toContainEqual({
      resolver: { in: ['0xaaa', '0xbbb'] },
    });
  });

  it('search builds a case-insensitive OR across question/shortName/description', async () => {
    await callPage({ filters: { search: '  hello  ' } as ConditionFilters });
    const search = (whereOf().AND as Record<string, unknown>[]).find(
      (clause) => 'OR' in clause
    );
    expect(search).toEqual({
      OR: [
        { question: { contains: 'hello', mode: 'insensitive' } },
        { shortName: { contains: 'hello', mode: 'insensitive' } },
        { description: { contains: 'hello', mode: 'insensitive' } },
      ],
    });
  });

  it('whitespace-only search adds no filter', async () => {
    await callPage({ filters: { search: '   ' } as ConditionFilters });
    const where = whereOf();
    expect(JSON.stringify(where)).not.toContain('"OR"');
  });

  it('categorySlugs nests through category.is.slug.in', async () => {
    await callPage({
      filters: { categorySlugs: ['crypto', 'sports'] } as ConditionFilters,
    });
    expect(whereOf().AND).toContainEqual({
      category: { is: { slug: { in: ['crypto', 'sports'] } } },
    });
  });

  it('minEndTime and maxEndTime combine into a single range filter', async () => {
    await callPage({
      filters: {
        minEndTime: 1000,
        maxEndTime: 2000,
      } as ConditionFilters,
    });
    expect(whereOf().AND).toContainEqual({ endTime: { gte: 1000, lte: 2000 } });
  });

  it('only minEndTime → one-sided range', async () => {
    await callPage({ filters: { minEndTime: 1000 } as ConditionFilters });
    expect(whereOf().AND).toContainEqual({ endTime: { gte: 1000 } });
  });

  it('ungroupedOnly maps to conditionGroupId=null', async () => {
    await callPage({ filters: { ungroupedOnly: true } as ConditionFilters });
    expect(whereOf().AND).toContainEqual({ conditionGroupId: null });
  });

  it('conditionGroupId is wrapped in equals', async () => {
    await callPage({ filters: { conditionGroupId: 42 } as ConditionFilters });
    expect(whereOf().AND).toContainEqual({
      conditionGroupId: { equals: 42 },
    });
  });

  it('settled filter passes through booleans', async () => {
    await callPage({ filters: { settled: true } as ConditionFilters });
    expect(whereOf().AND).toContainEqual({ settled: true });
  });

  it('resolvedToYes auto-couples settled=true', async () => {
    await callPage({ filters: { resolvedToYes: true } as ConditionFilters });
    expect(whereOf().AND).toContainEqual({
      settled: true,
      resolvedToYes: true,
    });
  });

  it('hasSimilarMarkets=true uses isEmpty:false', async () => {
    await callPage({
      filters: { hasSimilarMarkets: true } as ConditionFilters,
    });
    expect(whereOf().AND).toContainEqual({
      similarMarkets: { isEmpty: false },
    });
  });

  it('engagement=NONE narrows to openInterest=0 AND no attestations', async () => {
    await callPage({
      filters: { engagement: 'NONE' } as ConditionFilters,
    });
    const and = whereOf().AND as Record<string, unknown>[];
    expect(and).toContainEqual({ openInterest: { equals: '0' } });
    expect(and).toContainEqual({ attestations: { none: {} } });
  });

  it('engagement=ANY uses OR of openInterest!=0 / attestations.some', async () => {
    await callPage({
      filters: { engagement: 'ANY' } as ConditionFilters,
    });
    const and = whereOf().AND as Record<string, unknown>[];
    expect(and).toContainEqual({
      OR: [
        { openInterest: { not: { equals: '0' } } },
        { attestations: { some: {} } },
      ],
    });
  });
});
