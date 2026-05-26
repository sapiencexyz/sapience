import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  prediction: { findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn(), count: vi.fn() },
  pick: { findMany: vi.fn() },
  picks: { findMany: vi.fn() },
}));

vi.mock('../../../core/db', () => ({ default: mockPrisma }));

import { ActivityItem } from './Activity';
import { activity } from './queries/activity';

const callResolver = <TResult = unknown>(resolver: unknown) =>
  resolver as (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<TResult> | TResult;

const resolveTotal = async (v: unknown): Promise<number> =>
  typeof v === 'function'
    ? (v as () => Promise<number> | number)()
    : (v as number);

describe('ActivityItem (v2)', () => {
  it('discriminates rows by their unique field', () => {
    const resolveType = ActivityItem.__resolveType as (
      obj: unknown
    ) => string | null;
    expect(resolveType({ predictionId: '0xp' })).toBe('Prediction');
    expect(resolveType({ tradeHash: '0xt' })).toBe('Trade');
    expect(resolveType({})).toBeNull();
  });
});

describe('activity (v2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.prediction.count.mockResolvedValue(0);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.count.mockResolvedValue(0);
    mockPrisma.pick.findMany.mockResolvedValue([]);
    mockPrisma.picks.findMany.mockResolvedValue([]);
  });

  it('types: [] returns a zero-result page without querying', async () => {
    const result = await callResolver<{
      edges: unknown[];
      totalCount: number;
    }>(activity)(null, { first: 50, filter: { types: [] } }, {}, null);
    expect(result.edges).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('account filter ORs across predictor/counterparty and buyer/seller', async () => {
    await callResolver(activity)(
      null,
      { first: 50, filter: { account: '0xABC' } },
      {},
      null
    );
    const predictionCall = mockPrisma.prediction.findMany.mock.calls[0]?.[0];
    const tradeCall = mockPrisma.secondaryTrade.findMany.mock.calls[0]?.[0];
    expect(predictionCall.where).toEqual(
      expect.objectContaining({
        OR: [{ predictor: '0xabc' }, { counterparty: '0xabc' }],
      })
    );
    expect(tradeCall.where).toEqual(
      expect.objectContaining({
        OR: [{ buyer: '0xabc' }, { seller: '0xabc' }],
      })
    );
  });

  it('interleaves predictions and trades by timestamp DESC', async () => {
    mockPrisma.prediction.findMany.mockResolvedValueOnce([
      {
        predictionId: '0xp_old',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        predictionId: '0xp_new',
        createdAt: new Date('2026-01-03T00:00:00Z'),
      },
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValueOnce([
      {
        tradeHash: '0xt_mid',
        executedAt: Math.floor(
          new Date('2026-01-02T00:00:00Z').getTime() / 1000
        ),
      },
    ]);
    mockPrisma.prediction.count.mockResolvedValueOnce(2);
    mockPrisma.secondaryTrade.count.mockResolvedValueOnce(1);

    const result = await callResolver<{
      edges: { node: { predictionId?: string; tradeHash?: string } }[];
      totalCount: number;
    }>(activity)(null, { first: 10 }, {}, null);

    expect(await resolveTotal(result.totalCount)).toBe(3);
    expect(
      result.edges.map((e) => e.node.predictionId ?? e.node.tradeHash)
    ).toEqual(['0xp_new', '0xt_mid', '0xp_old']);
  });
});
