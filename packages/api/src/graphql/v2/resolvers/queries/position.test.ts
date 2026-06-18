/**
 * Unit tests for the v2 `positions` connection — the WAC (weighted-average-
 * cost) synthesis ported from v1's `runPositions`
 * (sdl/resolvers/queries/escrow.ts). The emission cases mirror
 * sdl/resolvers/queries/escrow.test.ts so the two implementations can be
 * diffed side by side; the connection-shape cases (cursors, hasNextPage,
 * totalCount) are v2-specific.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  position: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  secondaryTrade: { findMany: vi.fn() },
  prediction: { findFirst: vi.fn() },
}));

vi.mock('../../../../core/db', () => ({ default: mockPrisma }));

import { decodeCursor, encodeCursor } from '../../relay/connection';
import { positions } from './position';

type PositionsFn = (
  parent: unknown,
  args: Record<string, unknown>,
  ctx: unknown,
  info: unknown
) => Promise<{
  edges: { cursor: string; node: Record<string, unknown> }[];
  nodes: Record<string, unknown>[];
  totalCount: unknown;
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
}>;
const positionsFn = positions as unknown as PositionsFn;

const ALICE = '0xalice';
const BOB = '0xbob';
const TOKEN_PRED = '0xtokenpred';
const TOKEN_CP = '0xtokencp';
const PC_ID = 'pc-1';

// Explicit integer-second timestamps so mint < buy < sell ordering is
// unambiguous when interleaving Predictions (Date) with SecondaryTrades
// (integer seconds) in the WAC walk — same fixture scheme as
// sdl/resolvers/queries/escrow.test.ts.
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

const makePickConfig = (overrides: Record<string, unknown> = {}) => ({
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
  predictions: [] as Prediction[],
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

const callPositions = (args: Record<string, unknown> = {}) =>
  positionsFn(
    null,
    { first: 50, filter: { holder: ALICE }, ...args },
    {},
    null
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.position.findMany.mockResolvedValue([]);
  mockPrisma.position.count.mockResolvedValue(0);
  mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
});

describe('positions (v2) — synthetic row emission (WAC walk)', () => {
  it('never-sold open position: emits one OPEN row with mint cost basis', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '200',
        pickConfiguration: makePickConfig({
          predictions: [makePrediction()], // alice is predictor, mints 100
        }),
      }),
    ]);

    const result = await callPositions();

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      balance: '200',
      userCollateral: '100',
      totalPayout: '200',
      realizedPnl: null,
      status: 'OPEN',
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

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      balance: '0',
      userCollateral: '100',
      realizedPnl: '50', // 150 proceeds - 100 cost
      status: 'SOLD',
      soldTradeHash: '0xtrade1',
    });
  });

  it('partial secondary sale: emits SOLD row + OPEN row with remaining cost', async () => {
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

    expect(result.nodes).toHaveLength(2);
    const sold = result.nodes.find((r) => r.status === 'SOLD');
    const open = result.nodes.find((r) => r.status === 'OPEN');
    // WAC: cost=100, shares=200; sell 100 shares → allocated = 100*100/200 = 50.
    expect(sold).toMatchObject({
      userCollateral: '50',
      realizedPnl: '10', // 60 - 50
      balance: '0',
    });
    expect(open).toMatchObject({
      balance: '100',
      userCollateral: '50', // remaining
      realizedPnl: null,
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

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
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

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      // WAC at sell: cost pool = 180, shares pool = 300; allocate
      // 180 * 300 / 300 = 180.
      userCollateral: '180',
      realizedPnl: '90', // 270 - 180
      status: 'SOLD',
      soldTradeHash: '0xsell1',
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

    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });

  it('resolved position: emits the underlying OPEN row regardless of sells', async () => {
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

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      balance: '200',
      realizedPnl: null,
      status: 'OPEN',
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

    const result = await callPositions({ filter: { holder: BOB } });

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      userCollateral: '130',
      totalPayout: '200',
    });
  });
});

describe('positions (v2) — prediction resolution (CLAIM permalink)', () => {
  it('attaches the first holder-side prediction (v1 `predictionId ??=` semantics)', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '200',
        pickConfiguration: makePickConfig({
          predictions: [
            makePrediction({ predictionId: 'p-1' }),
            makePrediction({ predictionId: 'p-2' }),
          ],
        }),
      }),
    ]);

    const result = await callPositions();

    const prediction = result.nodes[0].prediction as {
      predictionId: string;
      pickConfiguration: unknown;
    };
    expect(prediction.predictionId).toBe('p-1');
    // The parent pickConfiguration is re-attached so the Prediction
    // resolver can serve pickConfig without a follow-up query.
    expect(prediction.pickConfiguration).toBeTruthy();
  });

  it('skips predictions where the holder is on the other side', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        isPredictorToken: false,
        tokenAddress: TOKEN_CP,
        holder: BOB,
        balance: '200',
        pickConfiguration: makePickConfig({
          predictions: [
            // BOB is predictor here — not his counterparty-token side.
            makePrediction({
              predictionId: 'p-1',
              predictor: BOB,
              counterparty: ALICE,
            }),
            makePrediction({
              predictionId: 'p-2',
              predictor: ALICE,
              counterparty: BOB,
            }),
          ],
        }),
      }),
    ]);

    const result = await callPositions({ filter: { holder: BOB } });

    expect(
      (result.nodes[0].prediction as { predictionId: string }).predictionId
    ).toBe('p-2');
  });

  it('prediction is null when no holder-side prediction exists (resolved row)', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '200',
        pickConfiguration: makePickConfig({
          resolved: true,
          result: 'PREDICTOR_WINS',
          predictions: [],
        }),
      }),
    ]);

    const result = await callPositions();

    expect(result.nodes[0].prediction).toBeNull();
  });
});

describe('positions (v2) — ordering', () => {
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

    expect(
      result.nodes.map((n) => `${n.id}${n.status === 'SOLD' ? '-sold' : ''}`)
    ).toEqual(['1-sold', '2']);
  });
});

describe('positions (v2) — RESOLVED_AT ordering (across pages)', () => {
  it('orders by pickConfiguration.resolvedAt and restricts to resolved positions', async () => {
    await callPositions({
      orderBy: { field: 'RESOLVED_AT', direction: 'DESC' },
    });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.orderBy).toEqual([
      { pickConfiguration: { resolvedAt: 'desc' } },
      { id: 'desc' },
    ]);
    // resolved-only filter merged into the pickConfiguration where so the
    // keyset never straddles a NULL boundary.
    expect(callArgs.where.pickConfiguration).toMatchObject({
      resolvedAt: { not: null },
    });
  });

  it('emits a resolvedAt-based cursor (k = resolvedAt seconds, not a date)', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '200',
        pickConfiguration: makePickConfig({
          resolved: true,
          result: 'PREDICTOR_WINS',
          resolvedAt: 1_700_000_000,
          predictions: [makePrediction()],
        }),
      }),
    ]);

    const result = await callPositions({
      orderBy: { field: 'RESOLVED_AT', direction: 'DESC' },
    });

    expect(decodeCursor(result.pageInfo.endCursor ?? '')).toEqual({
      k: '1700000000',
      id: '1',
    });
  });

  it('applies a relation keyset on resolvedAt when `after` is provided', async () => {
    const after = encodeCursor({ k: '1700000000', id: '5' });

    await callPositions({
      orderBy: { field: 'RESOLVED_AT', direction: 'DESC' },
      after,
    });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.where.AND).toHaveLength(2);
    const keyset = callArgs.where.AND[1];
    expect(keyset.OR[0]).toEqual({
      pickConfiguration: { resolvedAt: { lt: 1700000000 } },
    });
    expect(keyset.OR[1].AND).toEqual([
      { pickConfiguration: { resolvedAt: 1700000000 } },
      { id: { lt: 5 } },
    ]);
  });
});

describe('positions (v2) — query shape', () => {
  it('pushes the holder filter into the predictions include', async () => {
    // Without this, every prediction on the pickConfiguration is loaded —
    // including unrelated users — and discarded later in the WAC walk.
    await callPositions({ filter: { holder: '0xALICE' } });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.include?.pickConfiguration?.include?.predictions).toEqual({
      where: { OR: [{ predictor: '0xalice' }, { counterparty: '0xalice' }] },
    });
  });

  it('does not narrow predictions when holder is not provided', async () => {
    await callPositions({ filter: { pickConfigId: PC_ID } });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.include?.pickConfiguration?.include?.predictions).toBe(
      true
    );
  });

  it('fetches first + 1 raw rows so hasNextPage can be derived without a count query', async () => {
    await callPositions({ first: 15 });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(16);
  });

  it('skips the secondaryTrade.findMany call when there are no positions to resolve', async () => {
    await callPositions();

    expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
  });

  it('applies the keyset cursor predicate when `after` is provided', async () => {
    const after = encodeCursor({ k: baseUpdatedAt.toISOString(), id: '5' });

    await callPositions({ after });

    const callArgs = mockPrisma.position.findMany.mock.calls[0][0];
    // withCursorWhere AND-merges the base where with the keyset OR.
    expect(callArgs.where.AND).toHaveLength(2);
    expect(callArgs.where.AND[1].OR).toBeDefined();
  });
});

describe('positions (v2) — connection shape & pagination contract', () => {
  it('reports hasNextPage=true when the raw fetch returned the +1 sentinel row', async () => {
    const sixteen = Array.from({ length: 16 }, (_, i) =>
      makePosition({
        id: i + 1,
        balance: '100',
        pickConfiguration: makePickConfig({ predictions: [makePrediction()] }),
      })
    );
    mockPrisma.position.findMany.mockResolvedValue(sixteen);

    const result = await callPositions({ first: 15 });

    expect(result.pageInfo.hasNextPage).toBe(true);
    // Synthesized count comes from the first 15 rows (the +1 sentinel is dropped).
    expect(result.nodes).toHaveLength(15);
  });

  it('reports hasNextPage=false when fewer than first + 1 raw rows came back', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '100',
        pickConfiguration: makePickConfig({ predictions: [makePrediction()] }),
      }),
    ]);

    const result = await callPositions({ first: 15 });

    expect(result.pageInfo.hasNextPage).toBe(false);
    expect(result.nodes).toHaveLength(1);
  });

  it('CRITICAL: empty synthesized page still reports hasNextPage=true with an advancing endCursor', async () => {
    // Zero-balance unresolved positions with no sells emit nothing. The
    // naive "stop on empty" client logic would terminate pagination here;
    // worse, an endCursor derived from edges would be null and the client
    // could never advance. The cursor must track raw rows CONSUMED, not
    // rows emitted (v1's hasMore-from-over-fetch contract, escrow.ts).
    const sixteenEmpty = Array.from({ length: 16 }, (_, i) =>
      makePosition({
        id: i + 1,
        balance: '0',
        updatedAt: new Date((TS_SELL + i) * 1000),
        pickConfiguration: makePickConfig({ resolved: false, predictions: [] }),
      })
    );
    mockPrisma.position.findMany.mockResolvedValue(sixteenEmpty);

    const result = await callPositions({ first: 15 });

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.pageInfo.hasNextPage).toBe(true);
    // endCursor points at the 15th raw row (last consumed; sentinel dropped).
    const cursor = decodeCursor(result.pageInfo.endCursor ?? '');
    expect(cursor).toEqual({
      k: new Date((TS_SELL + 14) * 1000).toISOString(),
      id: '15',
    });
  });

  it('edge cursors come from the parent raw row, shared by its SOLD rows', async () => {
    mockPrisma.position.findMany.mockResolvedValue([
      makePosition({
        balance: '100',
        pickConfiguration: makePickConfig({ predictions: [makePrediction()] }),
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

    const expected = encodeCursor({ k: baseUpdatedAt.toISOString(), id: '1' });
    expect(result.edges).toHaveLength(2);
    expect(result.edges[0].cursor).toBe(expected);
    expect(result.edges[1].cursor).toBe(expected);
    expect(result.pageInfo.endCursor).toBe(expected);
  });

  it('totalCount counts surfaced underlying positions (v1 positionCount exclusion)', async () => {
    mockPrisma.position.count.mockResolvedValue(7);

    const result = await callPositions();

    // totalCount is a lazy thunk (only billed when the field is selected).
    const thunk = result.totalCount as unknown as () => Promise<number>;
    await expect(thunk()).resolves.toBe(7);
    const callArgs = mockPrisma.position.count.mock.calls[0][0];
    expect(callArgs.where.AND).toEqual([
      expect.objectContaining({ holder: ALICE }),
      { NOT: { balance: '0', pickConfiguration: { resolved: false } } },
    ]);
  });
});
