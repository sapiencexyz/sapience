import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attestation: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
  condition: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryConditionArgs,
  QueryUserArgs,
} from '../../__generated__/resolvers';

type QueryCategoriesPageArgs = { take: number; skip: number };
import {
  __clearCategoriesCache,
  categoriesPage,
  condition,
  user,
} from './crud';

type ResolverFn<Args, Out> = (
  parent: unknown,
  args: Args,
  ctx: unknown,
  info: unknown
) => Promise<Out>;

const categoriesPageFn = categoriesPage as unknown as ResolverFn<
  QueryCategoriesPageArgs,
  { items: unknown[]; hasMore: boolean }
>;
// `conditionFn` / `userFn` unused on this branch — the flat-scalar
// `condition(id:)` / `user(address:)` tests were dropped because the
// branch keeps the legacy `where:` arg shape. Restored alongside the
// arg flip in the final cleanup PR (slice #11). Keep the type imports
// referenced so eslint doesn't complain on the type-only side.
void condition;
void user;
void ({} as QueryConditionArgs);
void ({} as QueryUserArgs);

beforeEach(() => {
  vi.clearAllMocks();
  __clearCategoriesCache();
  mockPrisma.attestation.findMany.mockResolvedValue([]);
  mockPrisma.category.findMany.mockResolvedValue([]);
  mockPrisma.condition.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
});

describe('categoriesPage — pagination envelope', () => {
  it('caps take at MAX_TAKE (100) and probes for hasMore', async () => {
    await categoriesPageFn(
      undefined,
      { take: 9999, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    const args = mockPrisma.category.findMany.mock.calls[0][0];
    expect(args.take).toBe(101);
  });

  it('orders by name asc (alphabetical for the picker UI)', async () => {
    await categoriesPageFn(
      undefined,
      { take: 100, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    const args = mockPrisma.category.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ name: 'asc' });
  });
});

describe('categoriesPage — TtlCache (full-first-page only)', () => {
  const FIXTURE = [{ id: 1, name: 'Crypto', slug: 'crypto' }];

  beforeEach(() => {
    mockPrisma.category.findMany.mockResolvedValue(FIXTURE);
  });

  it('caches the full first page (skip=0, take >= 100) and serves subsequent calls without DB', async () => {
    await categoriesPageFn(
      undefined,
      { take: 100, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    await categoriesPageFn(
      undefined,
      { take: 100, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when skip > 0 (deep page)', async () => {
    await categoriesPageFn(
      undefined,
      { take: 100, skip: 100 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    await categoriesPageFn(
      undefined,
      { take: 100, skip: 100 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(2);
  });

  it('bypasses cache when take < 100 (partial first page)', async () => {
    await categoriesPageFn(
      undefined,
      { take: 50, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    await categoriesPageFn(
      undefined,
      { take: 50, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(2);
  });

  it('does not cache when the page itself reports hasMore=true (incomplete picture)', async () => {
    // 101 rows, take=100 → hasMore=true → don't poison the cache with a partial set.
    const overflow = Array.from({ length: 101 }, (_, i) => ({
      id: i,
      name: `c${i}`,
      slug: `s${i}`,
    }));
    mockPrisma.category.findMany.mockResolvedValue(overflow);

    await categoriesPageFn(
      undefined,
      { take: 100, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    await categoriesPageFn(
      undefined,
      { take: 100, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    // Both calls hit the DB because the first one didn't cache (hasMore=true).
    expect(mockPrisma.category.findMany).toHaveBeenCalledTimes(2);
  });

  it('returns the cached value (not a refetch)', async () => {
    const first = await categoriesPageFn(
      undefined,
      { take: 100, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 999, name: 'Stale', slug: 'stale' },
    ]);
    const second = await categoriesPageFn(
      undefined,
      { take: 100, skip: 0 } as QueryCategoriesPageArgs,
      undefined,
      undefined
    );
    expect(first.items).toEqual(FIXTURE);
    expect(second.items).toEqual(FIXTURE);
  });
});

// `condition(id:)` / `user(address:)` flat-scalar arg tests deferred —
// this branch keeps the `condition(where:)` / `user(where:)` shape for
// backwards compatibility. The flat-scalar flip lands in the final
// cleanup PR (slice #11) once deprecation telemetry shows the where:
// path is drained.
