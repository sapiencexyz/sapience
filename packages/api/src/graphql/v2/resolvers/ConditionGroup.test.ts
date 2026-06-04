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
import { decodeCursor, encodeCursor } from '../relay/connection';

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

  it('encodes the global id from its numeric id (name is no longer unique)', async () => {
    const id = await callResolver<string>(ConditionGroup.id)(
      { id: 7, name: 'My Group' },
      {},
      {},
      null
    );
    expect(fromGlobalIdV2(id)).toEqual({
      type: 'ConditionGroup',
      id: '7',
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

  it('conditionGroup(id:) decodes the numeric global id and queries by id', async () => {
    mockPrisma.conditionGroup.findUnique.mockResolvedValueOnce(null);
    const id = toGlobalIdV2('ConditionGroup', '7');
    const result = await callResolver(conditionGroup)(null, { id }, {}, null);
    expect(result).toBeNull();
    expect(mockPrisma.conditionGroup.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
    });
  });

  it('ConditionGroup.conditions: a non-numeric after cursor resets to offset 0', async () => {
    const condRows = Array.from({ length: 5 }, (_, i) => ({ id: `0xc${i}` }));
    mockPrisma.condition.findMany.mockResolvedValueOnce(condRows);
    // A keyset cursor minted under a different orderBy (or a tampered value)
    // has a non-numeric `k`.
    const garbage = encodeCursor({ k: 'not-a-number', id: 'x' });
    const conn = await callResolver<{ edges: { cursor: string }[] }>(
      ConditionGroup.conditions
    )({ id: 1, name: 'g' }, { first: 2, after: garbage }, {}, null);
    // A garbage skip must not collapse the page to empty (NaN slice) ...
    expect(conn.edges).toHaveLength(2);
    // ... and emitted cursors must stay numeric, not "NaN".
    expect(decodeCursor(conn.edges[0].cursor)?.k).toBe('0');
    expect(decodeCursor(conn.edges[1].cursor)?.k).toBe('1');
  });

  it('conditionGroups(orderBy OPEN_INTEREST): a non-numeric after cursor emits numeric cursors', async () => {
    mockPrisma.conditionGroup.findMany.mockResolvedValueOnce([
      { id: 10, name: 'a', createdAt: new Date(), totalOpenInterest: 5n },
      { id: 11, name: 'b', createdAt: new Date(), totalOpenInterest: 4n },
    ]);
    mockPrisma.conditionGroup.count.mockResolvedValueOnce(2);
    const garbage = encodeCursor({ k: 'deadbeef', id: '99' });
    const conn = await callResolver<{ edges: { cursor: string }[] }>(
      conditionGroups
    )(
      null,
      {
        first: 50,
        orderBy: { field: 'TOTAL_OPEN_INTEREST', direction: 'DESC' },
        after: garbage,
      },
      {},
      null
    );
    expect(decodeCursor(conn.edges[0].cursor)?.k).toBe('0');
  });
});
