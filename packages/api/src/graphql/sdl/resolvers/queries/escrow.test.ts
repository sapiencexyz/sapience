import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  position: { findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn() },
  pick: { findMany: vi.fn() },
  picks: { findMany: vi.fn() },
  prediction: { findUnique: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryPositionsArgs,
  QueryPositionCountArgs,
} from '../../__generated__/resolvers';
import {
  __clearPositionSynthesisCache,
  pickConfigurationsPage,
  positionCount,
  positionsPage,
  prediction,
} from './escrow';

// Resolvers in the generated module are typed as the
// `ResolverFn | ResolverWithResolve` union, which TypeScript can't narrow
// to a callable from outside Apollo. The implementations are plain async
// functions, so we cast to the function shape for direct invocation in
// tests.
type PositionsPageFn = (
  parent: unknown,
  args: QueryPositionsArgs,
  ctx: unknown,
  info: unknown
) => Promise<{
  items: unknown[];
  hasMore: boolean;
  totalCount: number | null;
  _countWhere?: unknown;
}>;
type PositionCountFn = (
  parent: unknown,
  args: QueryPositionCountArgs,
  ctx: unknown,
  info: unknown
) => Promise<number>;
const positionsPageFn = positionsPage as unknown as PositionsPageFn;
const positionCountFn = positionCount as unknown as PositionCountFn;

const ALICE = '0xalice';
const BOB = '0xbob';
const TOKEN_PRED = '0xtokenpred';
const TOKEN_CP = '0xtokencp';
const PC_ID = 'pc-1';

// Use explicit integer-second timestamps so mint < buy < sell ordering
// is unambiguous when interleaving Predictions (Date) with SecondaryTrades
// (integer seconds) in the resolver's WAC walk.
const TS_MINT = 1_000_000;
const TS_BUY = 2_000_000;
const TS_SELL = 3_000_000;
const baseCreatedAt = new Date(TS_MINT * 1000);
const baseUpdatedAt = new Date(TS_SELL * 1000);

type Prediction = {
  predictionId: string;
  predictor: string;
  counterparty: string;
  predictorCollateral: string;
  counterpartyCollateral: string;
  createdAt: Date;
};

type PickConfig = {
  id: string;
  chainId: number;
  marketAddress: string;
  totalPredictorCollateral: string;
  totalCounterpartyCollateral: string;
  claimedPredictorCollateral: string;
  claimedCounterpartyCollateral: string;
  resolved: boolean;
  result: string;
  resolvedAt: number | null;
  predictorToken: string | null;
  counterpartyToken: string | null;
  endsAt: number | null;
  isLegacy: boolean;
  picks: never[];
  predictions: Prediction[];
};

const makePickConfig = (overrides: Partial<PickConfig> = {}): PickConfig => ({
  id: PC_ID,
  chainId: 1,
  marketAddress: '0xmarket',
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
  predictions: [],
  ...overrides,
});

const makePosition = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  chainId: 1,
  tokenAddress: TOKEN_PRED,
  pickConfigId: PC_ID,
  isPredictorToken: true,
  holder: ALICE,
  balance: '0',
  createdAt: baseCreatedAt,
  updatedAt: baseUpdatedAt,
  pickConfiguration: makePickConfig(),
  ...overrides,
});

const makePrediction = (overrides: Partial<Prediction> = {}): Prediction => ({
  predictionId: 'p-1',
  predictor: ALICE,
  counterparty: BOB,
  predictorCollateral: '100',
  counterpartyCollateral: '100',
  createdAt: baseCreatedAt,
  ...overrides,
});

const makeTrade = (overrides: {
  seller: string;
  buyer: string;
  price: string;
  tokenAmount: string;
  executedAt: number;
  tradeHash: string;
  token?: string;
}) => ({
  chainId: 1,
  token: TOKEN_PRED,
  ...overrides,
});

type PositionRowShape = {
  id: string;
  balance: string;
  userCollateral: string | null;
  realizedPnL: string | null;
  totalPayout: string | null;
};

// Wrap positionsPage so the existing assertions (which check the row
// array directly) keep working — the synthetic-row + WAC logic is the
// same regardless of which Page/non-Page entry point is used.
const callPositions = async (
  args: Partial<QueryPositionsArgs> = {}
): Promise<PositionRowShape[]> => {
  const result = await positionsPageFn(
    undefined,
    { take: 50, skip: 0, holder: ALICE, ...args },
    undefined,
    undefined
  );
  return result.items as PositionRowShape[];
};

beforeEach(() => {
  vi.clearAllMocks();
  // Clear the synthesis cache between tests so per-test fixtures don't
  // accidentally hit a previous test's synthesized rows (the cache key
  // is `(chainId, token, holder, updatedAt)` and fixtures reuse those
  // values).
  __clearPositionSynthesisCache();
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
  // totalCount is now lazy — runPositions returns `_countWhere` and the
  // PositionsPage.totalCount field resolver issues the count query only
  // when the field is actually selected. The default mock here just
  // covers tests that do exercise the totalCount path.
  mockPrisma.position.count.mockResolvedValue(0);
});

describe('positions resolver — synthetic row emission', () => {
  it('never-sold open position: emits one open row with mint cost basis', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '200',
        pickConfiguration: makePickConfig({
          predictions: [makePrediction()], // alice is predictor, mints 100
        }),
      }),
    ]);

    const result = await callPositions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '1',
      balance: '200',
      userCollateral: '100',
      totalPayout: '200',
      realizedPnL: null,
    });
  });

  it('full secondary sale: emits one SOLD row, no open row', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '0',
        pickConfiguration: makePickConfig({
          predictions: [makePrediction()],
        }),
      }),
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      makeTrade({
        seller: ALICE,
        buyer: '0xcarol',
        price: '150',
        tokenAmount: '200',
        executedAt: TS_SELL,
        tradeHash: '0xtrade1',
      }),
    ]);

    const result = await callPositions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '1-sell-0xtrade1',
      balance: '0',
      userCollateral: '100',
      realizedPnL: '50', // 150 proceeds - 100 cost
    });
  });

  it('partial secondary sale: emits SOLD row + open row with remaining cost', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '100',
        pickConfiguration: makePickConfig({
          predictions: [makePrediction()],
        }),
      }),
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      makeTrade({
        seller: ALICE,
        buyer: '0xcarol',
        price: '60',
        tokenAmount: '100',
        executedAt: TS_SELL,
        tradeHash: '0xtrade1',
      }),
    ]);

    const result = await callPositions();

    expect(result).toHaveLength(2);
    const sold = result.find((r) => r.id.includes('-sell-'));
    const open = result.find((r) => !r.id.includes('-sell-'));
    // WAC: cost=100, shares=200; sell 100 shares → allocated = 100*100/200 = 50.
    expect(sold).toMatchObject({
      userCollateral: '50',
      realizedPnL: '10', // 60 - 50
      balance: '0',
    });
    expect(open).toMatchObject({
      id: '1',
      balance: '100',
      userCollateral: '50', // remaining
      realizedPnL: null,
    });
  });

  it('multi-mint single pickConfig: cost basis aggregates across predictions', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '600',
        pickConfiguration: makePickConfig({
          predictions: [
            makePrediction({
              predictionId: 'p-1',
              predictorCollateral: '100',
              counterpartyCollateral: '100',
            }),
            makePrediction({
              predictionId: 'p-2',
              predictorCollateral: '50',
              counterpartyCollateral: '150',
            }),
          ],
        }),
      }),
    ]);

    const result = await callPositions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userCollateral: '150', // 100 + 50
      totalPayout: '400', // 200 + 200
    });
  });

  it('secondary buy then sell: cost basis reflects WAC', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '0',
        pickConfiguration: makePickConfig({
          predictions: [makePrediction()], // alice mints: cost=100, shares=200
        }),
      }),
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      // alice buys 100 more shares for 80
      makeTrade({
        seller: '0xcarol',
        buyer: ALICE,
        price: '80',
        tokenAmount: '100',
        executedAt: TS_BUY,
        tradeHash: '0xbuy1',
      }),
      // alice sells all 300 shares for 270
      makeTrade({
        seller: ALICE,
        buyer: '0xdave',
        price: '270',
        tokenAmount: '300',
        executedAt: TS_SELL,
        tradeHash: '0xsell1',
      }),
    ]);

    const result = await callPositions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '1-sell-0xsell1',
      // WAC at sell: cost pool = 180, shares pool = 300; allocate
      // 180 * 300 / 300 = 180.
      userCollateral: '180',
      realizedPnL: '90', // 270 - 180
    });
  });

  it('zero balance, unresolved, no sells (transferred away): emits no rows', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '0',
        pickConfiguration: makePickConfig({
          predictions: [makePrediction()],
        }),
      }),
    ]);

    const result = await callPositions();

    expect(result).toEqual([]);
  });

  it('resolved position: emits the underlying row regardless of sells', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '200',
        pickConfiguration: makePickConfig({
          resolved: true,
          result: 'PREDICTOR_WINS',
          predictions: [makePrediction()],
        }),
      }),
    ]);
    // Even with a sell on a resolved pickConfig, no synthetic disposal row
    // should be emitted — the existing settlement-PnL flow takes over.
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      makeTrade({
        seller: ALICE,
        buyer: '0xcarol',
        price: '150',
        tokenAmount: '100',
        executedAt: TS_SELL,
        tradeHash: '0xtrade1',
      }),
    ]);

    const result = await callPositions();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: '1',
      balance: '200',
      realizedPnL: null,
    });
  });

  it('counterparty-side holder: cost basis comes from counterpartyCollateral', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        isPredictorToken: false,
        tokenAddress: TOKEN_CP,
        holder: BOB,
        balance: '200',
        pickConfiguration: makePickConfig({
          predictions: [
            makePrediction({
              predictorCollateral: '70',
              counterpartyCollateral: '130',
            }),
          ],
        }),
      }),
    ]);

    const result = await callPositions({ holder: BOB });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userCollateral: '130',
      totalPayout: '200',
    });
  });
});

describe('positions resolver — ordering', () => {
  it('sorts synthetic rows by updatedAt across positions, not grouped under parent', async () => {
    // Two positions: an old one that just had a sell (sell ts = TS_SELL,
    // most recent activity) and a newer one that's still open (updatedAt
    // between mint and sell). Synthetic SOLD row from the old position
    // should appear before the newer open row when sorted desc by updatedAt.
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        id: 1,
        balance: '0',
        createdAt: new Date(TS_MINT * 1000),
        updatedAt: new Date(TS_MINT * 1000),
        pickConfiguration: makePickConfig({ predictions: [makePrediction()] }),
      }),
      makePosition({
        id: 2,
        tokenAddress: TOKEN_CP,
        isPredictorToken: false,
        balance: '200',
        createdAt: new Date(TS_BUY * 1000),
        updatedAt: new Date(TS_BUY * 1000),
        pickConfiguration: makePickConfig({
          predictions: [
            makePrediction({
              predictor: BOB,
              counterparty: ALICE,
            }),
          ],
        }),
      }),
    ]);
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([
      makeTrade({
        seller: ALICE,
        buyer: '0xcarol',
        price: '150',
        tokenAmount: '200',
        executedAt: TS_SELL,
        tradeHash: '0xtrade1',
      }),
    ]);

    const result = await callPositions();

    expect(result.map((r) => r.id)).toEqual(['1-sell-0xtrade1', '2']);
  });
});

describe('positions resolver — query shape', () => {
  it('pushes the holder filter into the predictions include so we only pull the holder’s predictions', async () => {
    // Without this, every prediction on the pickConfiguration is loaded —
    // including unrelated users — and discarded later in the WAC walk.
    // For popular pickConfigs this is a 10x+ payload reduction.
    mockPrisma.position.findMany.mockResolvedValue([]);

    await callPositions({ holder: ALICE });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.include?.pickConfiguration?.include?.predictions).toEqual({
      where: {
        OR: [
          { predictor: ALICE.toLowerCase() },
          { counterparty: ALICE.toLowerCase() },
        ],
      },
    });
  });

  it('does not narrow predictions when holder is not provided (conditionId path)', async () => {
    mockPrisma.pick.findMany.mockResolvedValue([{ pickConfigId: PC_ID }]);
    mockPrisma.position.findMany.mockResolvedValue([]);

    await callPositions({ holder: undefined, conditionId: '0xcond' });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.include?.pickConfiguration?.include?.predictions).toBe(
      true
    );
  });

  it('issues secondaryTrade.findMany once after position.findMany returns rows', async () => {
    // Pick.condition lookups now batch through the request-scoped
    // `conditionById` DataLoader at field-resolution time, so the
    // resolver itself only fires the secondaryTrade fetch — no eager
    // condition pre-load. We're asserting the trade-fetch shape so
    // regressions on the position → trade pipeline still surface here.
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({ balance: '100' }),
    ]);

    await callPositions({ holder: ALICE });

    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(1);
    const tradesArgs = mockPrisma.secondaryTrade.findMany.mock.calls[0][0];
    expect(tradesArgs.where).toMatchObject({
      OR: [{ seller: { in: [ALICE] } }, { buyer: { in: [ALICE] } }],
    });
  });

  it('skips the secondaryTrade.findMany call when there are no positions to resolve', async () => {
    mockPrisma.position.findMany.mockResolvedValue([]);

    await callPositions({ holder: ALICE });

    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('fetches take + 1 raw rows so hasMore can be derived without a count query', async () => {
    mockPrisma.position.findMany.mockResolvedValue([]);

    await callPositions({ holder: ALICE, take: 15 });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(16);
  });
});

describe('positionsPage resolver — page envelope', () => {
  const callPositionsPage = (args: Partial<QueryPositionsArgs> = {}) =>
    positionsPageFn(
      undefined,
      { take: 15, skip: 0, holder: ALICE, ...args },
      undefined,
      undefined
    );

  it('reports hasMore=true when raw row fetch returned the extra sentinel row', async () => {
    // 15 + 1 = 16 raw rows → hasMore is true. We trim to take.
    const sixteen = Array.from({ length: 16 }, (_, i) =>
      makePosition({
        id: i + 1,
        balance: '100',
        pickConfiguration: makePickConfig({ predictions: [makePrediction()] }),
      })
    );
    mockPrisma.position.findMany.mockResolvedValue(sixteen);

    const result = await callPositionsPage({ take: 15 });

    expect(result.hasMore).toBe(true);
    // Synthesized count comes from the first 15 rows (the +1 sentinel is dropped).
    expect(result.items.length).toBe(15);
  });

  it('reports hasMore=false when fewer than take + 1 raw rows came back', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '100',
        pickConfiguration: makePickConfig({ predictions: [makePrediction()] }),
      }),
    ]);

    const result = await callPositionsPage({ take: 15 });

    expect(result.hasMore).toBe(false);
    expect(result.items.length).toBe(1);
  });

  it('returns hasMore=true even when the page synthesizes zero items, so the client keeps paging', async () => {
    // Crucial case: zero-balance unresolved positions with no sells emit
    // nothing. The naive "stop on empty" client logic would terminate
    // pagination here. With server-truth hasMore, the client keeps going.
    const sixteenEmpty = Array.from({ length: 16 }, (_, i) =>
      makePosition({
        id: i + 1,
        balance: '0',
        pickConfiguration: makePickConfig({
          resolved: false,
          predictions: [],
        }),
      })
    );
    mockPrisma.position.findMany.mockResolvedValue(sixteenEmpty);

    const result = await callPositionsPage({ take: 15 });

    expect(result.items.length).toBe(0);
    expect(result.hasMore).toBe(true);
  });

  it('runPositions does not issue a count query — totalCount is lazy', async () => {
    mockPrisma.position.findMany.mockResolvedValue([]);

    const result = await callPositionsPage({ take: 10, holder: ALICE });

    // The envelope carries `_countWhere` matching the findMany where, but
    // the count query itself is deferred to the PositionsPage.totalCount
    // field resolver (which only runs when the client selects totalCount).
    expect(result.totalCount).toBeNull();
    expect(mockPrisma.position.count).not.toHaveBeenCalled();
    const findManyWhere = mockPrisma.position.findMany.mock.calls[0][0].where;
    expect(result._countWhere).toEqual(findManyWhere);
  });

  it('synthesis cache: second request with same Position.updatedAt skips the trades fetch', async () => {
    const positionRow = makePosition({
      balance: '200',
      pickConfiguration: makePickConfig({
        predictions: [makePrediction()],
      }),
    });
    mockPrisma.position.findMany.mockResolvedValue([positionRow]);

    // First call: cache miss → trades fetch fires.
    const first = await callPositionsPage({ take: 10, holder: ALICE });
    expect(first.items.length).toBeGreaterThan(0);
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(1);

    // Second call (same Position.updatedAt): cache hit → no trades fetch.
    const second = await callPositionsPage({ take: 10, holder: ALICE });
    expect(second.items.length).toBe(first.items.length);
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(1);
  });

  it('synthesis cache: bumping Position.updatedAt invalidates the entry', async () => {
    const v1 = makePosition({
      balance: '200',
      updatedAt: new Date(1_000_000_000_000),
      pickConfiguration: makePickConfig({
        predictions: [makePrediction()],
      }),
    });
    mockPrisma.position.findMany.mockResolvedValue([v1]);
    await callPositionsPage({ take: 10, holder: ALICE });
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(1);

    const v2 = makePosition({
      balance: '200',
      updatedAt: new Date(1_000_000_001_000),
      pickConfiguration: makePickConfig({
        predictions: [makePrediction()],
      }),
    });
    mockPrisma.position.findMany.mockResolvedValue([v2]);
    await callPositionsPage({ take: 10, holder: ALICE });
    // Different updatedAt → cache miss → another trades fetch.
    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('positionCount resolver', () => {
  it('applies the same zero-balance/unresolved exclusion as positions', async () => {
    mockPrisma.position.count.mockResolvedValue(3);

    const result = await positionCountFn(
      undefined,
      { holder: ALICE },
      undefined,
      undefined
    );

    expect(result).toBe(3);
    const callArgs = mockPrisma.position.count.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({
      holder: ALICE.toLowerCase(),
      NOT: { balance: '0', pickConfiguration: { resolved: false } },
    });
  });
});

describe('prediction (single) resolver', () => {
  type PredictionFn = (
    parent: unknown,
    args: { id: string },
    ctx: unknown,
    info: unknown
  ) => Promise<unknown>;
  const predictionFn = prediction as unknown as PredictionFn;

  it('lower-cases the predictionId before lookup', async () => {
    mockPrisma.prediction.findUnique.mockResolvedValue(null);
    await predictionFn(undefined, { id: '0xABC' }, undefined, undefined);
    const args = mockPrisma.prediction.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ predictionId: '0xabc' });
  });

  it('returns null when not found', async () => {
    mockPrisma.prediction.findUnique.mockResolvedValue(null);
    const result = await predictionFn(
      undefined,
      { id: '0xmissing' },
      undefined,
      undefined
    );
    expect(result).toBeNull();
  });

  it('includes the pickConfiguration with picks for relation field resolvers', async () => {
    mockPrisma.prediction.findUnique.mockResolvedValue(null);
    await predictionFn(undefined, { id: 'p-1' }, undefined, undefined);
    const args = mockPrisma.prediction.findUnique.mock.calls[0][0];
    expect(args.include).toEqual({
      pickConfiguration: { include: { picks: true } },
    });
  });
});

describe('pickConfigurationsPage resolver', () => {
  type PickConfigurationsPageFn = (
    parent: unknown,
    args: Record<string, unknown>,
    ctx: unknown,
    info: unknown
  ) => Promise<{ items: unknown[]; hasMore: boolean }>;
  const pickConfigurationsPageFn =
    pickConfigurationsPage as unknown as PickConfigurationsPageFn;

  beforeEach(() => {
    mockPrisma.picks.findMany.mockResolvedValue([]);
  });

  it('caps take at 100 and fetches take + 1 to detect hasMore', async () => {
    await pickConfigurationsPageFn(
      undefined,
      { take: 9999, skip: 0 },
      undefined,
      undefined
    );
    const args = mockPrisma.picks.findMany.mock.calls[0][0];
    expect(args.take).toBe(101);
    expect(args.skip).toBe(0);
  });

  it('passes chainId, resolved, and result filters through to where', async () => {
    await pickConfigurationsPageFn(
      undefined,
      {
        take: 10,
        skip: 0,
        chainId: 8453,
        resolved: true,
        result: 'PREDICTOR_WINS',
      },
      undefined,
      undefined
    );
    const where = mockPrisma.picks.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      chainId: 8453,
      resolved: true,
      result: 'PREDICTOR_WINS',
    });
  });

  it('lower-cases tokens and matches either predictorToken or counterpartyToken', async () => {
    await pickConfigurationsPageFn(
      undefined,
      { take: 10, skip: 0, tokens: ['0xAAA', '0xBBB'] },
      undefined,
      undefined
    );
    const where = mockPrisma.picks.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { predictorToken: { in: ['0xaaa', '0xbbb'] } },
      { counterpartyToken: { in: ['0xaaa', '0xbbb'] } },
    ]);
  });

  it('rejects oversized tokens filter (>100) to prevent runaway IN lists', async () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `0x${i}`);
    await expect(
      pickConfigurationsPageFn(
        undefined,
        { take: 10, skip: 0, tokens: tooMany },
        undefined,
        undefined
      )
    ).rejects.toThrow(/limited to 100/);
  });

  it('hasMore=true when probe row is returned', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) =>
      makePickConfig({ id: `pc-${i}` })
    );
    mockPrisma.picks.findMany.mockResolvedValue(eleven);
    const result = await pickConfigurationsPageFn(
      undefined,
      { take: 10, skip: 0 },
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(10);
  });

  it('hasMore=false when fewer than take + 1 rows', async () => {
    mockPrisma.picks.findMany.mockResolvedValue([makePickConfig()]);
    const result = await pickConfigurationsPageFn(
      undefined,
      { take: 10, skip: 0 },
      undefined,
      undefined
    );
    expect(result.hasMore).toBe(false);
    expect(result.items).toHaveLength(1);
  });

  it('orders by createdAt desc (newest first)', async () => {
    await pickConfigurationsPageFn(
      undefined,
      { take: 10, skip: 0 },
      undefined,
      undefined
    );
    const args = mockPrisma.picks.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });
});
