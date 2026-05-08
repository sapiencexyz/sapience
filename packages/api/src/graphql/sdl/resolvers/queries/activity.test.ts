import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  prediction: { findMany: vi.fn() },
  secondaryTrade: { findMany: vi.fn() },
  pick: { findMany: vi.fn() },
  picks: { findMany: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type { QueryAccountActivityArgs } from '../../__generated__/resolvers';
import { accountActivityPage } from './activity';

type Fn = (
  parent: unknown,
  args: QueryAccountActivityArgs,
  ctx: unknown,
  info: unknown
) => Promise<{
  items: { type: string; timestamp: number }[];
  hasMore: boolean;
}>;
const accountActivityPageFn = accountActivityPage as unknown as Fn;

const ALICE = '0xalice';
const TOKEN_PRED = '0xtokenpred';
const TOKEN_CP = '0xtokencp';

const makePrediction = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  predictionId: 'p-1',
  chainId: 1,
  marketAddress: '0xm',
  predictor: ALICE,
  counterparty: '0xbob',
  predictorCollateral: '100',
  counterpartyCollateral: '100',
  collateralDeposited: null,
  collateralDepositedAt: null,
  settled: false,
  settledAt: null,
  result: 'UNRESOLVED',
  predictorClaimable: null,
  counterpartyClaimable: null,
  createdAt: new Date(2_000_000 * 1000),
  createTxHash: '0xtx',
  settleTxHash: null,
  refCode: null,
  isLegacy: false,
  pickConfiguration: {
    id: 'pc-1',
    chainId: 1,
    marketAddress: '0xm',
    totalPredictorCollateral: '0',
    totalCounterpartyCollateral: '0',
    claimedPredictorCollateral: '0',
    claimedCounterpartyCollateral: '0',
    resolved: false,
    result: 'UNRESOLVED',
    resolvedAt: null,
    predictorToken: TOKEN_PRED,
    counterpartyToken: TOKEN_CP,
    endsAt: null,
    isLegacy: false,
    picks: [],
  },
  ...overrides,
});

const makeTrade = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  chainId: 1,
  tradeHash: '0xtrade',
  seller: ALICE,
  buyer: '0xcarol',
  token: TOKEN_PRED,
  collateral: '0xcoll',
  tokenAmount: '100',
  price: '50',
  executedAt: 1_000_000,
  txHash: '0xtx',
  blockNumber: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.prediction.findMany.mockResolvedValue([]);
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
  mockPrisma.pick.findMany.mockResolvedValue([]);
  mockPrisma.picks.findMany.mockResolvedValue([]);
});

describe('accountActivityPage — argument validation', () => {
  it('caps take at 100 and clamps skip at MAX_SKIP=500', async () => {
    await accountActivityPageFn(
      undefined,
      {
        address: ALICE,
        take: 9999,
        skip: 99999,
      } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    const predArgs = mockPrisma.prediction.findMany.mock.calls[0][0];
    // fetchSize = cappedSkip(500) + cappedTake(100) + 1 = 601
    expect(predArgs.take).toBe(601);
  });

  it('lower-cases address before querying both tables', async () => {
    await accountActivityPageFn(
      undefined,
      {
        address: '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa',
        take: 10,
        skip: 0,
      } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    const predWhere = mockPrisma.prediction.findMany.mock.calls[0][0].where;
    const tradeWhere =
      mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(predWhere).toEqual({
      OR: [
        { predictor: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        { counterparty: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      ],
    });
    expect(tradeWhere).toEqual({
      OR: [
        { seller: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
        { buyer: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      ],
    });
  });

  it('omits the address clause when no address is provided (global feed)', async () => {
    await accountActivityPageFn(
      undefined,
      { take: 10, skip: 0 } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    const predWhere = mockPrisma.prediction.findMany.mock.calls[0][0].where;
    expect(predWhere).toEqual({});
  });
});

describe('accountActivityPage — type filter', () => {
  it("type='prediction' skips the trades fetch entirely", async () => {
    await accountActivityPageFn(
      undefined,
      {
        address: ALICE,
        take: 10,
        skip: 0,
        type: 'prediction',
      } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it("type='trade' skips the predictions fetch entirely", async () => {
    await accountActivityPageFn(
      undefined,
      {
        address: ALICE,
        take: 10,
        skip: 0,
        type: 'trade',
      } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(1);
  });

  it('omitted type fetches both', async () => {
    await accountActivityPageFn(
      undefined,
      { address: ALICE, take: 10, skip: 0 } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('accountActivityPage — interleave by timestamp', () => {
  it('sorts the merged feed by timestamp desc (newer first)', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      makePrediction({
        id: 1,
        createdAt: new Date(3_000_000 * 1000), // newer
      }),
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      makeTrade({ id: 2, executedAt: 1_000_000 }), // older
    ]);
    const result = await accountActivityPageFn(
      undefined,
      { address: ALICE, take: 10, skip: 0 } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(result.items.map((i) => i.type)).toEqual(['prediction', 'trade']);
    expect(result.items.map((i) => i.timestamp)).toEqual([
      3_000_000, 1_000_000,
    ]);
  });

  it('uses collateralDepositedAt over createdAt for prediction timestamp when present', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([
      makePrediction({
        collateralDepositedAt: 4_000_000, // wins over createdAt
        createdAt: new Date(2_000_000 * 1000),
      }),
    ]);
    const result = await accountActivityPageFn(
      undefined,
      { address: ALICE, take: 10, skip: 0 } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(result.items[0].timestamp).toBe(4_000_000);
  });
});

describe('accountActivityPage — pagination envelope', () => {
  it('hasMore=true when merged total exceeds skip + take', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) =>
        makePrediction({ id: i + 1, predictionId: `p-${i}` })
      )
    );
    const result = await accountActivityPageFn(
      undefined,
      { address: ALICE, take: 10, skip: 0 } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it('hasMore=false when merged total fits within the page', async () => {
    mockPrisma.prediction.findMany.mockResolvedValue([makePrediction()]);
    const result = await accountActivityPageFn(
      undefined,
      { address: ALICE, take: 10, skip: 0 } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(1);
  });
});

describe('accountActivityPage — scoping (pickConfigId / conditionId)', () => {
  it('conditionId resolves to a pickConfig set; trades fetched on that token set', async () => {
    mockPrisma.pick.findMany.mockResolvedValue([{ pickConfigId: 'pc-1' }]);
    mockPrisma.picks.findMany.mockResolvedValue([
      {
        id: 'pc-1',
        predictorToken: TOKEN_PRED,
        counterpartyToken: TOKEN_CP,
      },
    ]);

    await accountActivityPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        conditionId: '0xCOND',
      } as QueryAccountActivityArgs,
      undefined,
      undefined
    );

    expect(mockPrisma.pick.findMany).toHaveBeenCalledWith({
      where: { conditionId: '0xcond' },
      select: { pickConfigId: true },
      distinct: ['pickConfigId'],
    });
    const tradeWhere =
      mockPrisma.secondaryTrade.findMany.mock.calls[0][0].where;
    expect(tradeWhere).toEqual({ token: { in: [TOKEN_PRED, TOKEN_CP] } });
  });

  it('returns an empty page early when conditionId yields no pick configs (avoids unnecessary fetches)', async () => {
    mockPrisma.pick.findMany.mockResolvedValue([]);
    const result = await accountActivityPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        conditionId: '0xnope',
      } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
    expect(mockPrisma.prediction.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('pickConfigId filter scopes predictions directly by pickConfigId', async () => {
    mockPrisma.picks.findMany.mockResolvedValue([
      {
        id: 'pc-1',
        predictorToken: TOKEN_PRED,
        counterpartyToken: TOKEN_CP,
      },
    ]);

    await accountActivityPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        pickConfigId: '0xPC1',
      } as QueryAccountActivityArgs,
      undefined,
      undefined
    );
    const predWhere = mockPrisma.prediction.findMany.mock.calls[0][0].where;
    expect(predWhere).toEqual({ pickConfigId: '0xpc1' });
  });
});
