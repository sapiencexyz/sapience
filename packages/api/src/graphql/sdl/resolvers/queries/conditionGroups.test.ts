import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  conditionGroup: { findMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type { QueryConditionGroupsPageArgs } from '../../__generated__/resolvers';
import { conditionGroup, conditionGroupsPage } from './conditionGroups';

type ConditionGroupsPageFn = (
  parent: unknown,
  args: QueryConditionGroupsPageArgs,
  ctx: unknown,
  info: unknown
) => Promise<{ items: unknown[]; hasMore: boolean }>;
const conditionGroupsPageFn =
  conditionGroupsPage as unknown as ConditionGroupsPageFn;

const callPage = (overrides: Partial<QueryConditionGroupsPageArgs> = {}) =>
  conditionGroupsPageFn(
    undefined,
    {
      take: 50,
      skip: 0,
      filters: null,
      ...overrides,
    },
    undefined,
    undefined
  );

const whereOf = () =>
  mockPrisma.conditionGroup.findMany.mock.calls[0][0].where as Record<
    string,
    unknown
  >;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
});

describe('conditionGroupsPage — pagination envelope', () => {
  it('caps take at 100 and fetches take + 1 to detect hasMore', async () => {
    await callPage({ take: 9999 });
    const args = mockPrisma.conditionGroup.findMany.mock.calls[0][0];
    expect(args.take).toBe(101);
    expect(args.skip).toBe(0);
  });

  it('hasMore=true when probe row is returned', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ id: i + 1 }));
    mockPrisma.conditionGroup.findMany.mockResolvedValue(eleven);
    const result = await callPage({ take: 10 });
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it('hasMore=false when fewer than take + 1 rows', async () => {
    mockPrisma.conditionGroup.findMany.mockResolvedValue([{ id: 1 }]);
    const result = await callPage({ take: 10 });
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it('clamps skip to MAX_SKIP (1000)', async () => {
    await callPage({ skip: 999_999 });
    const args = mockPrisma.conditionGroup.findMany.mock.calls[0][0];
    expect(args.skip).toBe(1000);
  });

  it('defaults to createdAt desc ordering', async () => {
    await callPage();
    const args = mockPrisma.conditionGroup.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
});

describe('conditionGroupsPage — filter mapping', () => {
  it('with no filters: drops empty groups by default (some-Conditions clause)', async () => {
    await callPage({ filters: null });
    expect(whereOf()).toEqual({ AND: [{ condition: { some: {} } }] });
  });

  it('translates filters.ids → AND[{ id: { in } }] + default non-empty', async () => {
    await callPage({ filters: { ids: [1, 2, 3] } });
    expect(whereOf()).toEqual({
      AND: [{ id: { in: [1, 2, 3] } }, { condition: { some: {} } }],
    });
  });

  it('treats empty ids array as no-id-filter (only the default some-Conditions clause)', async () => {
    await callPage({ filters: { ids: [] } });
    expect(whereOf()).toEqual({ AND: [{ condition: { some: {} } }] });
  });

  it('search → name contains, case-insensitive', async () => {
    await callPage({ filters: { search: ' Election ' } });
    expect(whereOf()).toEqual({
      AND: [
        { name: { contains: 'Election', mode: 'insensitive' } },
        { condition: { some: {} } },
      ],
    });
  });

  it('categorySlugs → category.is.slug.in', async () => {
    await callPage({ filters: { categorySlugs: ['crypto', 'politics'] } });
    expect(whereOf()).toEqual({
      AND: [
        { category: { is: { slug: { in: ['crypto', 'politics'] } } } },
        { condition: { some: {} } },
      ],
    });
  });

  it('chainId pushes down to conditions.some.chainId (replaces the default empty some-clause)', async () => {
    await callPage({ filters: { chainId: 42161 } });
    expect(whereOf()).toEqual({
      AND: [{ condition: { some: { chainId: 42161 } } }],
    });
  });

  it('publicOnly pushes down to conditions.some.public=true', async () => {
    await callPage({ filters: { publicOnly: true } });
    expect(whereOf()).toEqual({
      AND: [{ condition: { some: { public: true } } }],
    });
  });

  it('chainId + publicOnly combine into a single some-clause (same Condition row must satisfy both)', async () => {
    await callPage({ filters: { chainId: 42161, publicOnly: true } });
    expect(whereOf()).toEqual({
      AND: [{ condition: { some: { chainId: 42161, public: true } } }],
    });
  });

  it('includeEmpty=true drops the default non-empty clause entirely', async () => {
    await callPage({ filters: { includeEmpty: true } });
    expect(whereOf()).toEqual({});
  });

  it('includeEmpty=true with chainId still pushes chainId into a some-clause', async () => {
    await callPage({ filters: { includeEmpty: true, chainId: 1 } });
    expect(whereOf()).toEqual({
      AND: [{ condition: { some: { chainId: 1 } } }],
    });
  });
});

describe('conditionGroup(where:) — single lookup', () => {
  type ConditionGroupFn = (
    parent: unknown,
    args: { where: { id: number } },
    ctx: unknown,
    info: unknown
  ) => Promise<unknown>;
  const conditionGroupFn = conditionGroup as unknown as ConditionGroupFn;

  it('passes where through to prisma.findUnique', async () => {
    mockPrisma.conditionGroup.findUnique.mockResolvedValue({
      id: 42,
      name: 'foo',
    });
    const result = await conditionGroupFn(
      undefined,
      { where: { id: 42 } },
      undefined,
      undefined
    );
    expect(mockPrisma.conditionGroup.findUnique).toHaveBeenCalledWith({
      where: { id: 42 },
    });
    expect(result).toEqual({ id: 42, name: 'foo' });
  });

  it('returns null when not found', async () => {
    mockPrisma.conditionGroup.findUnique.mockResolvedValue(null);
    const result = await conditionGroupFn(
      undefined,
      { where: { id: 9999 } },
      undefined,
      undefined
    );
    expect(result).toBeNull();
  });
});
