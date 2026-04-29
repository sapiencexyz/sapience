import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  $queryRaw: vi.fn(),
  category: {
    findMany: vi.fn(),
  },
};

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

const { popularTags, __clearPopularTagsCache } = await import('./tags');
const { categories, __clearCategoriesCache } = await import('./crud');

const callResolver = async <Args>(
  fn: (...args: unknown[]) => unknown,
  args: Args
): Promise<unknown> => fn({}, args, {}, {});

describe('popularTags TTL cache', () => {
  const FIXTURE = [{ tag: 'Politics' }, { tag: 'Sports' }, { tag: 'NFL' }];

  beforeEach(() => {
    __clearPopularTagsCache();
    mockPrisma.$queryRaw.mockReset();
    mockPrisma.$queryRaw.mockResolvedValue(FIXTURE);
  });

  it('queries the DB on first call and returns mapped tags', async () => {
    const result = await callResolver(popularTags as never, {});
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['Politics', 'Sports', 'NFL']);
  });

  it('returns cached value on the second call without re-querying', async () => {
    await callResolver(popularTags as never, {});
    await callResolver(popularTags as never, {});
    await callResolver(popularTags as never, {});
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('re-queries after cache is cleared', async () => {
    await callResolver(popularTags as never, {});
    __clearPopularTagsCache();
    await callResolver(popularTags as never, {});
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});

describe('categories TTL cache', () => {
  const FIXTURE = [{ id: 1, name: 'Crypto', slug: 'crypto' }];

  beforeEach(() => {
    __clearCategoriesCache();
    mockPrisma.category.findMany.mockReset();
    mockPrisma.category.findMany.mockResolvedValue(FIXTURE);
  });

  it('caches the no-args call', async () => {
    await callResolver(categories as never, {});
    await callResolver(categories as never, {});
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when where is passed', async () => {
    await callResolver(categories as never, {
      where: { name: { equals: 'Crypto' } },
    });
    await callResolver(categories as never, {
      where: { name: { equals: 'Crypto' } },
    });
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache when take is passed', async () => {
    await callResolver(categories as never, { take: 5 });
    await callResolver(categories as never, { take: 5 });
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(2);
  });

  it('mixed: caches no-args, bypasses args, no cross-pollution', async () => {
    await callResolver(categories as never, {}); // miss → DB call #1
    await callResolver(categories as never, {}); // cache hit
    await callResolver(categories as never, { take: 5 }); // bypass → DB call #2
    await callResolver(categories as never, {}); // still cached → no DB call
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(2);
  });

  it('returns the cached value on hit (not just count)', async () => {
    const first = await callResolver(categories as never, {});
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 999, name: 'Stale-if-this-shows', slug: 'stale' },
    ]);
    const second = await callResolver(categories as never, {});
    expect(first).toEqual(FIXTURE);
    expect(second).toEqual(FIXTURE); // cached, NOT the new mock value
  });
});
