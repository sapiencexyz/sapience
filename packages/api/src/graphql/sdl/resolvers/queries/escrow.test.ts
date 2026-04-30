import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  position: { findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn() },
  pick: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import type {
  QueryPositionsArgs,
  QueryPositionCountArgs,
} from '../../__generated__/resolvers';
import { positions, positionCount } from './escrow';

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
