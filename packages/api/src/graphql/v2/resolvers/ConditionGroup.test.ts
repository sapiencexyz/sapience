import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fromGlobalIdV2, toGlobalIdV2 } from '../relay/nodeRegistry';

const mockPrisma = vi.hoisted(() => ({
  conditionGroup: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  condition: { findMany: vi.fn(), count: vi.fn() },
  category: { findUnique: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { ConditionGroup } from './ConditionGroup';
import { conditionGroup, conditionGroups } from './queries/conditionGroup';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

describe('ConditionGroup (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.conditionGroup.findMany.mockResolvedValue([]);
    mockPrisma.conditionGroup.count.mockResolvedValue(0);
    mockPrisma.condition.findMany.mockResolvedValue([]);
    mockPrisma.condition.count.mockResolvedValue(0);
  });

  it('encodes the global id from its name, not the row id', async () => {
    const id = await callResolver<string>(ConditionGroup.id)(
      { id: 7, name: 'My Group' },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'ConditionGroup',
      id: 'My Group',
    });
  });

  it('totals collapses denormalized counters into one struct', () => {
    type Totals = {
      publicConditionCount: number;
      totalOpenInterest: bigint;
      totalSimilarMarketVolume24h: number;
    };
    const result = callResolver<Totals>(ConditionGroup.totals)(
      {
        publicConditionCount: 3,
        totalOpenInterest: '1234567890',
        totalSimilarMarketVolume24h: '99.5',
      },
      {},
      {},
      null
    ) as Totals;
    expect(result.publicConditionCount).toBe(3);
    expect(result.totalOpenInterest).toBe(1234567890n);
    expect(result.totalSimilarMarketVolume24h).toBe(99.5);
  });

  it('conditionGroups(filter: { categorySlug }) narrows by category slug', async () => {
    await callResolver(conditionGroups)(
      null,
      { first: 50, filter: { categorySlug: 'sports' } },
      {},
      null
    );
    expect(mockPrisma.conditionGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          category: { is: { slug: 'sports' } },
        }),
      })
    );
  });

  it('conditionGroup(id:) decodes the name global id and queries by name', async () => {
    mockPrisma.conditionGroup.findUnique.mockResolvedValueOnce(null);
    const id = toGlobalIdV2('ConditionGroup', 'My Group');
    const result = await callResolver(conditionGroup)(null, { id }, {}, null);
    expect(result).toBeNull();
    expect(mockPrisma.conditionGroup.findUnique).toHaveBeenCalledWith({
      where: { name: 'My Group' },
    });
  });
});
