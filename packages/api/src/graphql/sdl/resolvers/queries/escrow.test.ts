import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  position: { findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn() },
  claim: { findMany: vi.fn() },
  close: { findMany: vi.fn() },
  pick: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryPositionsArgs,
  QueryPositionCountArgs,
} from '../../__generated__/resolvers';
import { positions, positionCount, positionsPage } from './escrow';

// Resolvers in the generated module are typed as the
// `ResolverFn | ResolverWithResolve` union, which TypeScript can't narrow
// to a callable from outside Apollo. The implementations are plain async
// functions, so we cast to the function shape for direct invocation in
// tests.
type PositionsFn = (
  parent: unknown,
  args: QueryPositionsArgs,
  ctx: unknown,
  info: unknown
) => Promise<unknown[]>;
type PositionCountFn = (
  parent: unknown,
  args: QueryPositionCountArgs,
  ctx: unknown,
  info: unknown
) => Promise<number>;
const positionsFn = positions as unknown as PositionsFn;
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

const callPositions = (
  args: Partial<QueryPositionsArgs> = {}
): Promise<PositionRowShape[]> => {
  return positionsFn(
    undefined,
    { take: 50, skip: 0, holder: ALICE, ...args },
    undefined,
    undefined
  ) as Promise<PositionRowShape[]>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
  mockPrisma.claim.findMany.mockResolvedValue([]);
  mockPrisma.close.findMany.mockResolvedValue([]);
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

  it('active=true excludes resolved, claimed, and closed rows while historical queries include them', async () => {
    const rows = [
      makePosition({
        id: 1,
        tokenAddress: TOKEN_PRED,
        balance: '200',
        pickConfiguration: makePickConfig({
          resolved: true,
          result: 'PREDICTOR_WINS',
          predictions: [makePrediction()],
        }),
      }),
      makePosition({
        id: 2,
        pickConfigId: 'private-unpriceable-claim',
        tokenAddress: TOKEN_CP,
        isPredictorToken: false,
        balance: '200',
        pickConfiguration: makePickConfig({
          id: 'private-unpriceable-claim',
          predictions: [
            makePrediction({ predictor: BOB, counterparty: ALICE }),
          ],
        }),
      }),
      makePosition({
        id: 3,
        pickConfigId: 'private-unpriceable-close',
        tokenAddress: '0xclosedtoken',
        balance: '200',
        pickConfiguration: makePickConfig({
          id: 'private-unpriceable-close',
          predictorToken: '0xclosedtoken',
          predictions: [makePrediction()],
        }),
      }),
      makePosition({
        id: 4,
        pickConfigId: 'private-unpriceable-active',
        tokenAddress: '0xactivetoken',
        balance: '200',
        pickConfiguration: makePickConfig({
          id: 'private-unpriceable-active',
          predictorToken: '0xactivetoken',
          predictions: [makePrediction()],
        }),
      }),
    ];
    mockPrisma.position.findMany.mockResolvedValue(rows);
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        pickConfigId: 'private-unpriceable-claim',
        holder: ALICE,
        positionToken: TOKEN_CP,
      },
    ]);
    mockPrisma.close.findMany.mockResolvedValue([
      {
        pickConfigId: 'private-unpriceable-close',
        predictorHolder: ALICE,
        counterpartyHolder: BOB,
      },
    ]);

    const historical = await callPositions();
    const active = await callPositions({ active: true });

    expect(historical.map((r) => r.id)).toEqual(['1', '2', '3', '4']);
    expect(active.map((r) => r.id)).toEqual(['4']);
    expect(mockPrisma.position.findMany.mock.calls[1][0].where).toMatchObject({
      holder: ALICE,
      NOT: { balance: '0' },
      pickConfiguration: { resolved: false },
    });
  });

  it('active=true with settled=true is an empty, incompatible filter combination', async () => {
    const result = await callPositions({ active: true, settled: true });

    expect(result).toEqual([]);
    expect(mockPrisma.position.findMany).not.toHaveBeenCalled();
  });

  it('active=true omits sell-history synthetic rows, keeping only the live row', async () => {
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
        price: '80',
        tokenAmount: '100',
        executedAt: TS_SELL,
        tradeHash: '0xtrade1',
      }),
    ]);

    const historical = await callPositions();
    const active = await callPositions({ active: true });

    expect(historical.map((r) => r.id)).toEqual(['1-sell-0xtrade1', '1']);
    expect(active.map((r) => r.id)).toEqual(['1']);
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

  it('runs preloadPickConditions and secondaryTrade.findMany in parallel after position.findMany', async () => {
    // We can't observe scheduling directly, but we can confirm both
    // dependent fetches were issued from the resolver. The Promise.all
    // wrapper means neither blocks the other.
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({ balance: '100' }),
    ]);

    await callPositions({ holder: ALICE });

    expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledTimes(1);
    // preloadPickConditions issues a condition.findMany when ctx is provided.
    // We don't pass ctx in this suite, so it's a no-op — but the trades
    // call is the smoking gun that the parallel branch ran.
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

describe('positionsPage resolver', () => {
  type PositionsPageFn = (
    parent: unknown,
    args: QueryPositionsArgs,
    ctx: unknown,
    info: unknown
  ) => Promise<{ items: unknown[]; hasMore: boolean }>;
  const positionsPageFn = positionsPage as unknown as PositionsPageFn;

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
