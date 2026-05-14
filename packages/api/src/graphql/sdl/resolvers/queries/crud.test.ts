import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attestation: { findMany: vi.fn() },
  category: { findMany: vi.fn() },
  condition: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryAttestationsPageArgs,
  QueryCategoriesPageArgs,
  QueryConditionArgs,
  QueryUserArgs,
} from '../../__generated__/resolvers';
import {
  __clearCategoriesCache,
  attestationsPage,
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

const attestationsPageFn = attestationsPage as unknown as ResolverFn<
  QueryAttestationsPageArgs,
  { items: unknown[]; hasMore: boolean }
>;
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

describe('attestationsPage — pagination envelope', () => {
  it('caps take at 100 and probes for hasMore (take + 1)', async () => {
    await attestationsPageFn(
      undefined,
      { take: 9999, skip: 0 } as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    const args = mockPrisma.attestation.findMany.mock.calls[0][0];
    expect(args.take).toBe(101);
    expect(args.skip).toBe(0);
  });

  it('hasMore=true when probe row is returned', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => ({ uid: `u-${i}` }));
    mockPrisma.attestation.findMany.mockResolvedValue(eleven);
    const result = await attestationsPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it('hasMore=false when fewer than take + 1 rows', async () => {
    mockPrisma.attestation.findMany.mockResolvedValue([{ uid: 'u-1' }]);
    const result = await attestationsPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(1);
  });
});

describe('attestationsPage — filter construction', () => {
  it('passes single-value filters straight through to Prisma where', async () => {
    await attestationsPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        uid: 'u',
        attester: '0xa',
        conditionId: '0xc',
        schemaId: '0xs',
        recipient: '0xr',
      } as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    const where = mockPrisma.attestation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      uid: 'u',
      attester: '0xa',
      conditionId: '0xc',
      schemaId: '0xs',
      recipient: '0xr',
    });
  });

  it('combines minTime and maxTime into a single time-range filter', async () => {
    await attestationsPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        minTime: 100,
        maxTime: 200,
      } as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    const where = mockPrisma.attestation.findMany.mock.calls[0][0].where;
    expect(where.time).toEqual({ gte: 100, lte: 200 });
  });

  it('only minTime → one-sided range', async () => {
    await attestationsPageFn(
      undefined,
      { take: 10, skip: 0, minTime: 100 } as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    const where = mockPrisma.attestation.findMany.mock.calls[0][0].where;
    expect(where.time).toEqual({ gte: 100 });
  });
});

describe('attestationsPage — orderBy mapping', () => {
  it('defaults to time desc', async () => {
    await attestationsPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    const args = mockPrisma.attestation.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ time: 'desc' });
  });

  it('orderBy=CREATED_AT maps to createdAt field', async () => {
    await attestationsPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        orderBy: 'CREATED_AT',
      } as unknown as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    const args = mockPrisma.attestation.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('orderDirection=asc applies', async () => {
    await attestationsPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        orderDirection: 'asc',
      } as unknown as QueryAttestationsPageArgs,
      undefined,
      undefined
    );
    const args = mockPrisma.attestation.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ time: 'asc' });
  });
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
