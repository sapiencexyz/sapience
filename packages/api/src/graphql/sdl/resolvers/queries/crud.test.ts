import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  attestation: { findMany: vi.fn() },
  category: { findMany: vi.fn(), count: vi.fn() },
  condition: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryConditionArgs,
  QueryUserArgs,
} from '../../__generated__/resolvers';
import { encodeCursor } from '../../../relay/cursor';
import {
  __clearCategoriesCache,
  categoriesConnection,
  condition,
  user,
} from './crud';

type CategoriesConnectionArgs = {
  first?: number | null;
  after?: string | null;
};
type ResolverFn<Args, Out> = (
  parent: unknown,
  args: Args,
  ctx: unknown,
  info: unknown
) => Promise<Out>;

const categoriesConnectionFn = categoriesConnection as unknown as ResolverFn<
  CategoriesConnectionArgs,
  {
    nodes: unknown[];
    edges: { cursor: string }[];
    totalCount: number;
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  }
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
  mockPrisma.category.count.mockResolvedValue(0);
  mockPrisma.condition.findUnique.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockResolvedValue(null);
});

describe('categoriesConnection — Relay pagination', () => {
  it('caps first at MAX_TAKE (100) and probes for hasMore', async () => {
    await categoriesConnectionFn(
      undefined,
      { first: 9999 },
      undefined,
      undefined
    );
    const args = mockPrisma.category.findMany.mock.calls[0][0];
    expect(args.take).toBe(101);
  });

  it('orders by name asc, then id asc for stable cursors', async () => {
    await categoriesConnectionFn(
      undefined,
      { first: 100 },
      undefined,
      undefined
    );
    const args = mockPrisma.category.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
  });

  it('uses a composite name/id cursor predicate matching the stable order', async () => {
    const after = encodeCursor({ k: 'Crypto', id: '7' });
    await categoriesConnectionFn(
      undefined,
      { first: 25, after },
      undefined,
      undefined
    );
    const args = mockPrisma.category.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      OR: [
        { name: { gt: 'Crypto' } },
        { AND: [{ name: { equals: 'Crypto' } }, { id: { gt: 7 } }] },
      ],
    });
  });

  it('returns nodes, edges, totalCount, and hasNextPage', async () => {
    mockPrisma.category.findMany.mockResolvedValue([
      { id: 1, name: 'Crypto', slug: 'crypto' },
      { id: 2, name: 'Sports', slug: 'sports' },
    ]);
    mockPrisma.category.count.mockResolvedValue(2);

    const result = await categoriesConnectionFn(
      undefined,
      { first: 1 },
      undefined,
      undefined
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
    expect(result.totalCount).toBe(2);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.endCursor).toBe(result.edges[0].cursor);
  });
});

// `condition(id:)` / `user(address:)` flat-scalar arg tests deferred —
// this branch keeps the `condition(where:)` / `user(where:)` shape for
// backwards compatibility. The flat-scalar flip lands in the final
// cleanup PR (slice #11) once deprecation telemetry shows the where:
// path is drained.
