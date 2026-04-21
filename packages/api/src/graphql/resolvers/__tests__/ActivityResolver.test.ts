import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  prediction: {
    findMany: vi.fn(),
  },
  secondaryTrade: {
    findMany: vi.fn(),
  },
  picks: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  pick: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../db', () => ({ default: mockPrisma }));

// Stub generated type-graphql (imported transitively via EscrowResolver)
vi.mock('@generated/type-graphql', () => ({
  ConditionGroup: class ConditionGroup {},
  Condition: class Condition {},
  SortOrder: { asc: 'asc', desc: 'desc' },
}));
vi.mock('@generated/type-graphql/helpers', () => ({
  getPrismaFromContext: (ctx: Record<string, unknown>) => ctx.prisma,
}));

import { ActivityResolver } from '../ActivityResolver';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrediction(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    predictionId: 'pred-1',
    chainId: 1,
    marketAddress: '0xmarket',
    predictor: '0xalice',
    counterparty: '0xbob',
    predictorCollateral: '1000000000000000000',
    counterpartyCollateral: '1000000000000000000',
    collateralDeposited: true,
    collateralDepositedAt: 1000,
    settled: false,
    settledAt: null,
    result: null,
    predictorClaimable: null,
    counterpartyClaimable: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    createTxHash: '0xtx1',
    settleTxHash: null,
    refCode: null,
    isLegacy: false,
    pickConfiguration: {
      id: 'pc-1',
      chainId: 1,
      marketAddress: '0xmarket',
      totalPredictorCollateral: '1000000000000000000',
      totalCounterpartyCollateral: '1000000000000000000',
      claimedPredictorCollateral: '0',
      claimedCounterpartyCollateral: '0',
      resolved: false,
      result: null,
      resolvedAt: null,
      predictorToken: '0xtoken-pred',
      counterpartyToken: '0xtoken-cp',
      endsAt: 2000,
      isLegacy: false,
      predictionId: 'pred-1',
      picks: [
        {
          id: 'pick-1',
          pickConfigId: 'pc-1',
          conditionResolver: '0xresolver',
          conditionId: '0xcond',
          predictedOutcome: 0,
        },
      ],
    },
    ...overrides,
  };
}

function makeTrade(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    chainId: 1,
    tradeHash: '0xhash1',
    seller: '0xalice',
    buyer: '0xcharlie',
    token: '0xtoken-pred',
    collateral: '0xcollateral',
    tokenAmount: '500000000000000000',
    price: '2000000000000000000',
    executedAt: 1500,
    txHash: '0xtx2',
    blockNumber: 100,
    refCode: null,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ActivityResolver', () => {
  let resolver: ActivityResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new ActivityResolver();
    mockPrisma.picks.findMany.mockResolvedValue([]);
    mockPrisma.picks.findUnique.mockResolvedValue(null);
    mockPrisma.pick.findMany.mockResolvedValue([]);
  });

  it('merges predictions and trades sorted by timestamp descending', async () => {
    const pred1 = makePrediction({ id: 1, collateralDepositedAt: 900 });
    const pred2 = makePrediction({ id: 2, collateralDepositedAt: 1100 });
    const trade1 = makeTrade({ id: 1, executedAt: 1000 });

    mockPrisma.prediction.findMany.mockResolvedValue([pred2, pred1]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([trade1]);

    const result = await resolver.accountActivity('0xAlice', 20, 0);

    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe(1100);
    expect(result[0].type).toBe('prediction');
    expect(result[1].timestamp).toBe(1000);
    expect(result[1].type).toBe('trade');
    expect(result[2].timestamp).toBe(900);
    expect(result[2].type).toBe('prediction');
  });

  it('lowercases the address for queries', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    await resolver.accountActivity('0xABCDEF', 10, 0);

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ predictor: '0xabcdef' }, { counterparty: '0xabcdef' }],
        },
      })
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ seller: '0xabcdef' }, { buyer: '0xabcdef' }] },
      })
    );
  });

  it('filters to predictions only when type="prediction"', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    await resolver.accountActivity('0xalice', 10, 0, 'prediction');

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledOnce();
    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('filters to trades only when type="trade"', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    await resolver.accountActivity('0xalice', 10, 0, 'trade');

    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledOnce();
  });

  it('applies skip and take correctly to merged results', async () => {
    const predictions = Array.from({ length: 5 }, (_, i) =>
      makePrediction({ id: i + 1, collateralDepositedAt: 100 + i })
    );
    mockPrisma.prediction.findMany.mockResolvedValue(predictions);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    const result = await resolver.accountActivity('0xalice', 2, 2);

    // Sorted desc: timestamps 104, 103, [102, 101], 100
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe(102);
    expect(result[1].timestamp).toBe(101);
  });

  it('caps take at 100', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    await resolver.accountActivity('0xalice', 999, 0);

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });

  it('caps skip at 500', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    await resolver.accountActivity('0xalice', 20, 9999);

    // fetchSize = cappedSkip(500) + cappedTake(20) = 520
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 520 })
    );
  });

  it('fetches skip + take from each source', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    await resolver.accountActivity('0xalice', 20, 40);

    // fetchSize = 40 + 20 = 60
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 60 })
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 60 })
    );
  });

  it('attaches pick configs to trades via token lookup', async () => {
    const trade = makeTrade({ token: '0xTOKEN-PRED' });
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([trade]);
    mockPrisma.picks.findMany.mockResolvedValue([
      {
        id: 'pc-1',
        chainId: 1,
        marketAddress: '0xmarket',
        totalPredictorCollateral: '1000',
        totalCounterpartyCollateral: '1000',
        claimedPredictorCollateral: '0',
        claimedCounterpartyCollateral: '0',
        resolved: false,
        result: null,
        resolvedAt: null,
        predictorToken: '0xtoken-pred',
        counterpartyToken: '0xtoken-cp',
        endsAt: 2000,
        isLegacy: false,
        predictionId: null,
        picks: [],
      },
    ]);

    const result = await resolver.accountActivity('0xalice', 20, 0);

    expect(result[0].trade?.pickConfig).toBeTruthy();
    expect(result[0].trade?.pickConfig?.predictorToken).toBe('0xtoken-pred');
  });

  it('uses createdAt fallback when collateralDepositedAt is null', async () => {
    const pred = makePrediction({
      collateralDepositedAt: null,
      createdAt: new Date('2025-06-15T12:00:00Z'),
    });
    mockPrisma.prediction.findMany.mockResolvedValue([pred]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    const result = await resolver.accountActivity('0xalice', 20, 0);

    const expectedTs = Math.floor(
      new Date('2025-06-15T12:00:00Z').getTime() / 1000
    );
    expect(result[0].timestamp).toBe(expectedTs);
  });

  it('returns empty array when no data exists', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

    const result = await resolver.accountActivity('0xalice', 20, 0);

    expect(result).toEqual([]);
  });

  it('lowercases pickConfigId before querying', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.picks.findMany.mockResolvedValue([
      {
        id: '0xpc-mixedcase',
        predictorToken: '0xtoken-pred',
        counterpartyToken: '0xtoken-cp',
      },
    ]);

    await resolver.accountActivity(
      '0xalice',
      20,
      0,
      undefined,
      '0xPC-MixedCase'
    );

    expect(mockPrisma.picks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['0xpc-mixedcase'] } },
      })
    );
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ pickConfigId: '0xpc-mixedcase' }),
          ]),
        }),
      })
    );
  });

  it('filters predictions by pickConfigId when provided', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.picks.findMany.mockResolvedValue([
      {
        id: 'pc-1',
        predictorToken: '0xtoken-pred',
        counterpartyToken: '0xtoken-cp',
      },
    ]);

    await resolver.accountActivity('0xalice', 20, 0, undefined, 'pc-1');

    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { OR: [{ predictor: '0xalice' }, { counterparty: '0xalice' }] },
            { pickConfigId: 'pc-1' },
          ],
        }),
      })
    );
  });

  it('filters trades by the pickConfig tokens when pickConfigId is provided', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.picks.findMany.mockResolvedValue([
      {
        id: 'pc-1',
        predictorToken: '0xTOKEN-PRED',
        counterpartyToken: '0xTOKEN-CP',
      },
    ]);

    await resolver.accountActivity('0xalice', 20, 0, undefined, 'pc-1');

    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { OR: [{ seller: '0xalice' }, { buyer: '0xalice' }] },
            { token: { in: ['0xtoken-pred', '0xtoken-cp'] } },
          ],
        }),
      })
    );
  });

  it('returns no trades when pickConfigId does not resolve to any pick configuration', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    // No rows come back for this id → no tokens → trades short-circuited
    mockPrisma.picks.findMany.mockResolvedValue([]);

    const result = await resolver.accountActivity(
      '0xalice',
      20,
      0,
      undefined,
      'pc-missing'
    );

    expect(result).toEqual([]);
    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('filters predictions and trades by conditionId via matched pickConfigs', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    // Two pick configs contain the condition
    mockPrisma.pick.findMany.mockResolvedValue([
      { pickConfigId: 'pc-a' },
      { pickConfigId: 'pc-b' },
    ]);
    mockPrisma.picks.findMany.mockResolvedValue([
      {
        id: 'pc-a',
        predictorToken: '0xa-pred',
        counterpartyToken: '0xa-cp',
      },
      {
        id: 'pc-b',
        predictorToken: '0xb-pred',
        counterpartyToken: null,
      },
    ]);

    await resolver.accountActivity(
      undefined,
      20,
      0,
      undefined,
      undefined,
      '0xCONDITION-Abc'
    );

    // conditionId → distinct pickConfigIds lookup
    expect(mockPrisma.pick.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conditionId: '0xcondition-abc' },
        select: { pickConfigId: true },
        distinct: ['pickConfigId'],
      })
    );

    // Predictions filtered by pickConfigId IN
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pickConfigId: { in: ['pc-a', 'pc-b'] },
        }),
      })
    );

    // Trades filtered by the derived tokens (deduped, lowercased, nulls dropped)
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          token: { in: ['0xa-pred', '0xa-cp', '0xb-pred'] },
        }),
      })
    );
  });

  it('short-circuits when conditionId matches no pickConfigs', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.pick.findMany.mockResolvedValue([]);

    const result = await resolver.accountActivity(
      undefined,
      20,
      0,
      undefined,
      undefined,
      '0xnoop'
    );

    expect(result).toEqual([]);
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('combines account and conditionId filters', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
    mockPrisma.pick.findMany.mockResolvedValue([{ pickConfigId: 'pc-x' }]);
    mockPrisma.picks.findMany.mockResolvedValue([
      { id: 'pc-x', predictorToken: '0xtok-p', counterpartyToken: '0xtok-c' },
    ]);

    await resolver.accountActivity(
      '0xAlice',
      20,
      0,
      undefined,
      undefined,
      '0xcond'
    );

    // Single-element scope collapses to a flat equality (not `{ in: [...] }`).
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { OR: [{ predictor: '0xalice' }, { counterparty: '0xalice' }] },
            { pickConfigId: 'pc-x' },
          ],
        }),
      })
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            { OR: [{ seller: '0xalice' }, { buyer: '0xalice' }] },
            { token: { in: ['0xtok-p', '0xtok-c'] } },
          ],
        }),
      })
    );
  });

  it('returns global activity when address is omitted', async () => {
    const pred = makePrediction({ id: 1, collateralDepositedAt: 1000 });
    const trade = makeTrade({ id: 1, executedAt: 900 });
    mockPrisma.prediction.findMany.mockResolvedValue([pred]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([trade]);

    const result = await resolver.accountActivity(undefined, 20, 0);

    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('prediction');
    expect(result[1].type).toBe('trade');
    // No address filter — queries with empty where clause
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    );
  });
});
