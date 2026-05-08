import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => {
  const condition = {
    findUniqueOrThrow: vi.fn(),
  };
  const user = {
    findUniqueOrThrow: vi.fn(),
  };
  return { condition, user };
});

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { loadRelation } from './relationHelpers';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadRelation — fast path (relation already on parent)', () => {
  it('returns the relation value without invoking findUniqueOrThrow', async () => {
    const preloaded = { id: 'cat-1', name: 'Crypto' };
    const parent = { id: 'c-1', category: preloaded };

    const result = await loadRelation(parent, 'category', {
      parentModel: 'condition',
      parentWhere: { id: 'c-1' },
      prismaRelationName: 'category',
    });

    expect(result).toBe(preloaded);
    expect(mockPrisma.condition.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('returns null when the parent explicitly has null for the relation (e.g. orphan)', async () => {
    const parent = { id: 'c-1', category: null };

    const result = await loadRelation(parent, 'category', {
      parentModel: 'condition',
      parentWhere: { id: 'c-1' },
      prismaRelationName: 'category',
    });

    expect(result).toBeNull();
    expect(mockPrisma.condition.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('returns an empty array as a valid pre-loaded value (avoids spurious refetch)', async () => {
    const parent = { id: 'c-1', attestations: [] };

    const result = await loadRelation(parent, 'attestations', {
      parentModel: 'condition',
      parentWhere: { id: 'c-1' },
      prismaRelationName: 'attestations',
    });

    expect(result).toEqual([]);
    expect(mockPrisma.condition.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('loadRelation — slow path (DB fallback)', () => {
  it('falls back to findUniqueOrThrow().<relation>() when parent does not carry the relation', async () => {
    const fetched = { id: 'cat-1', name: 'Crypto' };
    const relationFetcher = vi.fn().mockResolvedValue(fetched);
    mockPrisma.condition.findUniqueOrThrow.mockReturnValue({
      category: relationFetcher,
    });

    const result = await loadRelation({ id: 'c-1' }, 'category', {
      parentModel: 'condition',
      parentWhere: { id: 'c-1' },
      prismaRelationName: 'category',
    });

    expect(mockPrisma.condition.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'c-1' },
    });
    expect(relationFetcher).toHaveBeenCalled();
    expect(result).toBe(fetched);
  });

  it('forwards the relation args (where/orderBy/take) to the relation fetcher', async () => {
    const relationFetcher = vi.fn().mockResolvedValue([]);
    mockPrisma.condition.findUniqueOrThrow.mockReturnValue({
      attestations: relationFetcher,
    });

    const args = {
      where: { schemaId: '0xs' },
      orderBy: [{ time: 'desc' }],
      take: 10,
    };
    await loadRelation({ id: 'c-1' }, 'attestations', {
      parentModel: 'condition',
      parentWhere: { id: 'c-1' },
      prismaRelationName: 'attestations',
      args,
    });

    expect(relationFetcher).toHaveBeenCalledWith(args);
  });

  it('uses the parentWhere from opts (id-by-string for User vs id-by-int for ConditionGroup)', async () => {
    const relationFetcher = vi.fn().mockResolvedValue([]);
    mockPrisma.user.findUniqueOrThrow.mockReturnValue({
      referrals: relationFetcher,
    });

    await loadRelation({ address: '0xalice' }, 'referrals', {
      parentModel: 'user',
      parentWhere: { address: '0xalice' },
      prismaRelationName: 'referrals',
    });

    expect(mockPrisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { address: '0xalice' },
    });
  });

  it('throws a clear error when the relation name is wrong (catches typos in resolver wiring)', async () => {
    mockPrisma.condition.findUniqueOrThrow.mockReturnValue({});

    await expect(
      loadRelation({ id: 'c-1' }, 'doesNotExist', {
        parentModel: 'condition',
        parentWhere: { id: 'c-1' },
        prismaRelationName: 'doesNotExist',
      })
    ).rejects.toThrow(/loadRelation/);
  });
});
