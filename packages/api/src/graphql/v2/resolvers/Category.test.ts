import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2, toGlobalIdV2 } from '../relay/nodeRegistry';
import { encodeCursor } from '../relay/connection';

const mockPrisma = vi.hoisted(() => ({
  category: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { Category } from './Category';
import { category, categories } from './queries/category';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('Category (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.category.findMany.mockResolvedValue([]);
    mockPrisma.category.count.mockResolvedValue(0);
  });

  it('encodes the global id from its slug, not the row id', async () => {
    const id = await callResolver<string>(Category.id)(
      { id: 42, slug: 'sports' },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Category', id: 'sports' });
  });

  it('category(id:) decodes the slug global id and queries by slug', async () => {
    mockPrisma.category.findUnique.mockResolvedValueOnce(null);
    const id = toGlobalIdV2('Category', 'sports');
    const result = await callResolver(category)(null, { id }, {}, null);
    expect(result).toBeNull();
    expect(mockPrisma.category.findUnique).toHaveBeenCalledWith({
      where: { slug: 'sports' },
    });
  });

  it('categories(...) applies a case-insensitive search filter', async () => {
    await callResolver(categories)(
      null,
      { first: 50, filter: { search: 'Sports' } },
      {},
      null
    );
    expect(mockPrisma.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: { contains: 'Sports', mode: 'insensitive' },
        }),
      })
    );
  });

  it('categories(orderBy CREATED_AT) pages via Prisma native id cursor, not a ms keyset', async () => {
    const after = encodeCursor({ k: '2026-01-01T00:00:00.123Z', id: '42' });
    await callResolver(categories)(
      null,
      { first: 50, orderBy: { field: 'CREATED_AT', direction: 'DESC' }, after },
      {},
      null
    );
    const arg = mockPrisma.category.findMany.mock.calls[0]?.[0] as {
      cursor?: { id: number };
      skip?: number;
      where?: { AND?: unknown };
    };
    // Native cursor positioning — precision-safe for Timestamp(6) createdAt.
    expect(arg.cursor).toEqual({ id: 42 });
    expect(arg.skip).toBe(1);
    // ...and NOT the old ms-truncating keyset folded into the where.
    expect(arg.where?.AND).toBeUndefined();
  });

  it('categories(orderBy NAME) keeps the value keyset (string field, no precision issue)', async () => {
    const after = encodeCursor({ k: 'Sports', id: '42' });
    await callResolver(categories)(
      null,
      { first: 50, orderBy: { field: 'NAME', direction: 'ASC' }, after },
      {},
      null
    );
    const arg = mockPrisma.category.findMany.mock.calls[0]?.[0] as {
      cursor?: unknown;
      where?: { AND?: unknown };
    };
    expect(arg.cursor).toBeUndefined();
    expect(arg.where?.AND).toBeDefined();
  });
});
