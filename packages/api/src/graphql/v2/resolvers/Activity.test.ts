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
import { encodeCursor } from '../relay/cursor';

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

type WhereNode = {
  AND?: WhereNode[];
  OR?: WhereNode[];
  createdAt?: { lt?: Date; equals?: Date; gte?: Date };
  predictionId?: { lt?: string };
};

// Minimal evaluator for the prediction-side Prisma `where` the activity
// resolver builds — lets us assert which rows the cursor predicate admits
// onto the next page without coupling to its exact AND/OR nesting.
const matchPrediction = (
  where: WhereNode,
  row: { predictionId: string; createdAt: Date }
): boolean => {
  if (!where || Object.keys(where).length === 0) return true;
  if (where.AND) return where.AND.every((w) => matchPrediction(w, row));
  if (where.OR) return where.OR.some((w) => matchPrediction(w, row));
  if (where.createdAt) {
    const c = where.createdAt;
    if (c.gte && !(row.createdAt.getTime() >= c.gte.getTime())) return false;
    if (c.lt && !(row.createdAt.getTime() < c.lt.getTime())) return false;
    if (c.equals && !(row.createdAt.getTime() === c.equals.getTime()))
      return false;
  }
  if (
    where.predictionId?.lt != null &&
    !(row.predictionId < where.predictionId.lt)
  )
    return false;
  return true;
};

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

  it('paging after a TRADE cursor excludes same-timestamp predictions (no cross-page duplication)', async () => {
    // Boundary landed on a trade at ts=1000. In the global order
    // (ts DESC, PREDICTION before TRADE, id DESC) every prediction at
    // ts=1000 sorts BEFORE this trade and was already emitted last page.
    const tradeCursor = encodeCursor({ k: '1000', id: 'TRADE:0xdd' });
    await callResolver(activity)(
      null,
      { first: 3, after: tradeCursor },
      {},
      null
    );

    const where = mockPrisma.prediction.findMany.mock.calls[0]?.[0]
      ?.where as WhereNode;
    const sameTs = { predictionId: '0xbb', createdAt: new Date(1000 * 1000) };
    const earlier = { predictionId: '0xaa', createdAt: new Date(999 * 1000) };

    expect(matchPrediction(where, sameTs)).toBe(false); // must NOT re-include
    expect(matchPrediction(where, earlier)).toBe(true); // strictly earlier stays
  });

  it('paging after a PREDICTION cursor keeps only same-timestamp predictions that sort after it', async () => {
    // Boundary landed on prediction 0xcc at ts=1000; ordering is id DESC,
    // so only predictions with id < 0xcc remain for the next page.
    const predCursor = encodeCursor({ k: '1000', id: 'PREDICTION:0xcc' });
    await callResolver(activity)(
      null,
      { first: 3, after: predCursor },
      {},
      null
    );

    const where = mockPrisma.prediction.findMany.mock.calls[0]?.[0]
      ?.where as WhereNode;
    const after = { predictionId: '0xbb', createdAt: new Date(1000 * 1000) };
    const before = { predictionId: '0xdd', createdAt: new Date(1000 * 1000) };

    expect(matchPrediction(where, after)).toBe(true);
    expect(matchPrediction(where, before)).toBe(false);
  });
});
