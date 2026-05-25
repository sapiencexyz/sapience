import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2 } from '../relay/nodeRegistry';

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

  it('encodes the global id as v2 Category:<rowId>', async () => {
    const id = await callResolver<string>(Category.id)(
      { id: 42 },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({ type: 'Category', id: '42' });
  });

  it('exposes the row id via the named field `categoryId`', () => {
    expect(
      callResolver<number>(Category.categoryId)({ id: 42 }, {}, {}, null)
    ).toBe(42);
  });

  it('category(id:) returns null when not found', async () => {
    mockPrisma.category.findUnique.mockResolvedValueOnce(null);
    const result = await callResolver(category)(null, { id: 999 }, {}, null);
    expect(result).toBeNull();
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
});
