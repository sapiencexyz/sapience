import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  legacyPosition: { findMany: vi.fn() },
  event: { findMany: vi.fn() },
  claim: { findMany: vi.fn() },
  close: { findMany: vi.fn() },
  prediction: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));

vi.mock('../../generated/prisma', () => ({
  LegacyPositionStatus: { settled: 'settled', consolidated: 'consolidated' },
  SettlementResult: { UNRESOLVED: 'UNRESOLVED' },
}));
vi.mock('../db', () => ({ default: mockPrisma }));

import {
  calculateLegacyPositionPnL,
  calculatePositionPnL,
  calculateCombinedPositionPnL,
} from './positionPnL';

describe('calculateLegacyPositionPnL', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no positions found', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([]);
    mockPrisma.event.findMany.mockResolvedValue([]);

    const result = await calculateLegacyPositionPnL();
    expect(result).toEqual([]);
  });

  it('calculates PnL correctly when predictor wins', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorNftTokenId: '1',
        counterpartyNftTokenId: '2',
        mintedAt: '1000',
        predictorWon: true,
      },
    ]);
    mockPrisma.event.findMany.mockResolvedValue([
      {
        timestamp: 1000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '1',
          takerNftTokenId: '2',
          makerCollateral: '300',
          takerCollateral: '700',
          totalCollateral: '1000',
        },
      },
    ]);

    const result = await calculateLegacyPositionPnL();

    const predictor = result.find((r) => r.owner === '0xpredictor');
    const counterparty = result.find((r) => r.owner === '0xcounterparty');

    // predictor gains: totalCollateral - predictorCollateral = 1000 - 300 = 700
    expect(predictor).toEqual({
      owner: '0xpredictor',
      totalPnL: '700',
      positionCount: 1,
    });
    // counterparty loses their collateral: -700
    expect(counterparty).toEqual({
      owner: '0xcounterparty',
      totalPnL: '-700',
      positionCount: 1,
    });
  });

  it('calculates PnL correctly when counterparty wins', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorNftTokenId: '1',
        counterpartyNftTokenId: '2',
        mintedAt: '1000',
        predictorWon: false,
      },
    ]);
    mockPrisma.event.findMany.mockResolvedValue([
      {
        timestamp: 1000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '1',
          takerNftTokenId: '2',
          makerCollateral: '300',
          takerCollateral: '700',
          totalCollateral: '1000',
        },
      },
    ]);

    const result = await calculateLegacyPositionPnL();

    const predictor = result.find((r) => r.owner === '0xpredictor');
    const counterparty = result.find((r) => r.owner === '0xcounterparty');

    // counterparty gains: totalCollateral - counterpartyCollateral = 1000 - 700 = 300
    expect(counterparty).toEqual({
      owner: '0xcounterparty',
      totalPnL: '300',
      positionCount: 1,
    });
    // predictor loses their collateral: -300
    expect(predictor).toEqual({
      owner: '0xpredictor',
      totalPnL: '-300',
      positionCount: 1,
    });
  });

  it('accumulates PnL across multiple positions for the same owner', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([
      {
        predictor: '0xAlice',
        counterparty: '0xBob',
        predictorNftTokenId: '1',
        counterpartyNftTokenId: '2',
        mintedAt: '1000',
        predictorWon: true,
      },
      {
        predictor: '0xAlice',
        counterparty: '0xCharlie',
        predictorNftTokenId: '3',
        counterpartyNftTokenId: '4',
        mintedAt: '2000',
        predictorWon: false,
      },
    ]);
    mockPrisma.event.findMany.mockResolvedValue([
      {
        timestamp: 1000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '1',
          takerNftTokenId: '2',
          makerCollateral: '400',
          takerCollateral: '600',
          totalCollateral: '1000',
        },
      },
      {
        timestamp: 2000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '3',
          takerNftTokenId: '4',
          makerCollateral: '500',
          takerCollateral: '500',
          totalCollateral: '1000',
        },
      },
    ]);

    const result = await calculateLegacyPositionPnL();
    const alice = result.find((r) => r.owner === '0xalice');

    // Position 1: Alice wins → +600 (1000-400)
    // Position 2: Alice loses → -500
    // Net: 100
    expect(alice).toEqual({
      owner: '0xalice',
      totalPnL: '100',
      positionCount: 2,
    });
  });

  it('skips positions with no matching mint event', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorNftTokenId: '1',
        counterpartyNftTokenId: '2',
        mintedAt: '1000',
        predictorWon: true,
      },
    ]);
    // No matching events
    mockPrisma.event.findMany.mockResolvedValue([]);

    const result = await calculateLegacyPositionPnL();
    expect(result).toEqual([]);
  });

  it('uses BigInt 0 fallback for null collateral fields', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorNftTokenId: '1',
        counterpartyNftTokenId: '2',
        mintedAt: '1000',
        predictorWon: true,
      },
    ]);
    mockPrisma.event.findMany.mockResolvedValue([
      {
        timestamp: 1000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '1',
          takerNftTokenId: '2',
          makerCollateral: null,
          takerCollateral: null,
          totalCollateral: '1000',
        },
      },
    ]);

    const result = await calculateLegacyPositionPnL();
    const predictor = result.find((r) => r.owner === '0xpredictor');

    // totalCollateral - 0 = 1000
    expect(predictor?.totalPnL).toBe('1000');
  });

  it('normalizes addresses to lowercase', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([
      {
        predictor: '0xABCDEF',
        counterparty: '0x123456',
        predictorNftTokenId: '1',
        counterpartyNftTokenId: '2',
        mintedAt: '1000',
        predictorWon: true,
      },
    ]);
    mockPrisma.event.findMany.mockResolvedValue([
      {
        timestamp: 1000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '1',
          takerNftTokenId: '2',
          makerCollateral: '500',
          takerCollateral: '500',
          totalCollateral: '1000',
        },
      },
    ]);

    const result = await calculateLegacyPositionPnL();
    expect(result.map((r) => r.owner)).toEqual(
      expect.arrayContaining(['0xabcdef', '0x123456'])
    );
  });

  it('filters by owner when owners array is provided', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([
      {
        predictor: '0xAlice',
        counterparty: '0xBob',
        predictorNftTokenId: '1',
        counterpartyNftTokenId: '2',
        mintedAt: '1000',
        predictorWon: true,
      },
      {
        predictor: '0xCharlie',
        counterparty: '0xDave',
        predictorNftTokenId: '3',
        counterpartyNftTokenId: '4',
        mintedAt: '2000',
        predictorWon: true,
      },
    ]);
    mockPrisma.event.findMany.mockResolvedValue([
      {
        timestamp: 1000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '1',
          takerNftTokenId: '2',
          makerCollateral: '500',
          takerCollateral: '500',
          totalCollateral: '1000',
        },
      },
      {
        timestamp: 2000n,
        logData: {
          eventType: 'PredictionMinted',
          makerNftTokenId: '3',
          takerNftTokenId: '4',
          makerCollateral: '500',
          takerCollateral: '500',
          totalCollateral: '1000',
        },
      },
    ]);

    const result = await calculateLegacyPositionPnL(undefined, undefined, [
      '0xAlice',
    ]);
    const owners = result.map((r) => r.owner);
    // Only Alice and Bob appear (they share a position)
    expect(owners).toContain('0xalice');
    expect(owners).toContain('0xbob');
    // Charlie and Dave's position is excluded
    expect(owners).not.toContain('0xcharlie');
    expect(owners).not.toContain('0xdave');
  });

  it('passes chainId and marketAddress in where clause', async () => {
    mockPrisma.legacyPosition.findMany.mockResolvedValue([]);
    mockPrisma.event.findMany.mockResolvedValue([]);

    await calculateLegacyPositionPnL(42, '0xMarketAddr');

    expect(mockPrisma.legacyPosition.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        chainId: 42,
        marketAddress: '0xmarketaddr',
      }),
    });
  });
});

describe('calculatePositionPnL', () => {
  beforeEach(() => vi.clearAllMocks());

  const setupEmptyMocks = () => {
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);
  };

  it('returns empty array when no claims, closes, or predictions', async () => {
    setupEmptyMocks();

    const result = await calculatePositionPnL();
    expect(result).toEqual([]);
  });

  it('calculates positive PnL from a claim', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xHolder',
        positionToken: '0xToken',
        collateralPaid: '1500',
        tokensBurned: '1000',
      },
    ]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    const result = await calculatePositionPnL();
    const holder = result.find((r) => r.owner === '0xholder');

    // PnL = collateralPaid - tokensBurned = 1500 - 1000 = 500
    expect(holder).toEqual({
      owner: '0xholder',
      totalPnL: '500',
      realizedPnL: '500',
      unrealizedPnL: '0',
      positionCount: 1,
      claimCount: 1,
      closeCount: 0,
    });
  });

  it('calculates negative PnL from a claim', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xHolder',
        positionToken: '0xToken',
        collateralPaid: '200',
        tokensBurned: '1000',
      },
    ]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    const result = await calculatePositionPnL();
    const holder = result.find((r) => r.owner === '0xholder');

    // PnL = 200 - 1000 = -800
    expect(holder?.realizedPnL).toBe('-800');
    expect(holder?.totalPnL).toBe('-800');
  });

  it('calculates close PnL for predictor side', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([
      {
        predictorHolder: '0xPredictor',
        counterpartyHolder: '0xCounterparty',
        predictorTokensBurned: '1000',
        predictorPayout: '1200',
        counterpartyTokensBurned: '1000',
        counterpartyPayout: '800',
      },
    ]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    const result = await calculatePositionPnL();
    const predictor = result.find((r) => r.owner === '0xpredictor');

    // PnL = payout - tokensBurned = 1200 - 1000 = 200
    expect(predictor).toEqual({
      owner: '0xpredictor',
      totalPnL: '200',
      realizedPnL: '200',
      unrealizedPnL: '0',
      positionCount: 1,
      claimCount: 0,
      closeCount: 1,
    });
  });

  it('calculates close PnL for counterparty side', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([
      {
        predictorHolder: '0xPredictor',
        counterpartyHolder: '0xCounterparty',
        predictorTokensBurned: '1000',
        predictorPayout: '1200',
        counterpartyTokensBurned: '1000',
        counterpartyPayout: '800',
      },
    ]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    const result = await calculatePositionPnL();
    const counterparty = result.find((r) => r.owner === '0xcounterparty');

    // PnL = payout - tokensBurned = 800 - 1000 = -200
    expect(counterparty).toEqual({
      owner: '0xcounterparty',
      totalPnL: '-200',
      realizedPnL: '-200',
      unrealizedPnL: '0',
      positionCount: 1,
      claimCount: 0,
      closeCount: 1,
    });
  });

  it('calculates unrealized PnL for settled unclaimed predictions', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorCollateral: '500',
        counterpartyCollateral: '500',
        predictorClaimable: '900',
        counterpartyClaimable: '100',
        pickConfiguration: {
          predictorToken: '0xPredToken',
          counterpartyToken: '0xCpToken',
        },
      },
    ]);

    const result = await calculatePositionPnL();
    const predictor = result.find((r) => r.owner === '0xpredictor');
    const counterparty = result.find((r) => r.owner === '0xcounterparty');

    // Predictor unrealized: 900 - 500 = 400
    expect(predictor?.unrealizedPnL).toBe('400');
    expect(predictor?.realizedPnL).toBe('0');
    expect(predictor?.totalPnL).toBe('400');

    // Counterparty unrealized: 100 - 500 = -400
    expect(counterparty?.unrealizedPnL).toBe('-400');
    expect(counterparty?.totalPnL).toBe('-400');
  });

  it('prevents double-counting when a position is already claimed', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xPredictor',
        positionToken: '0xPredToken',
        collateralPaid: '900',
        tokensBurned: '500',
      },
    ]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorCollateral: '500',
        counterpartyCollateral: '500',
        predictorClaimable: '900',
        counterpartyClaimable: '100',
        pickConfiguration: {
          predictorToken: '0xPredToken',
          counterpartyToken: '0xCpToken',
        },
      },
    ]);

    const result = await calculatePositionPnL();
    const predictor = result.find((r) => r.owner === '0xpredictor');

    // Claim: 900 - 500 = 400 (realized)
    // Unrealized should be 0 because claimedTokenHolders has 0xpredtoken:0xpredictor
    expect(predictor?.realizedPnL).toBe('400');
    expect(predictor?.unrealizedPnL).toBe('0');
    expect(predictor?.totalPnL).toBe('400');
    expect(predictor?.positionCount).toBe(1);
  });

  it('combines realized and unrealized PnL in totalPnL', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xAlice',
        positionToken: '0xTokenA',
        collateralPaid: '1200',
        tokensBurned: '1000',
      },
    ]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        predictor: '0xAlice',
        counterparty: '0xBob',
        predictorCollateral: '500',
        counterpartyCollateral: '500',
        predictorClaimable: '800',
        counterpartyClaimable: '200',
        pickConfiguration: {
          predictorToken: '0xTokenB',
          counterpartyToken: '0xTokenC',
        },
      },
    ]);

    const result = await calculatePositionPnL();
    const alice = result.find((r) => r.owner === '0xalice');

    // Realized from claim: 1200 - 1000 = 200
    // Unrealized from prediction: 800 - 500 = 300
    // Total: 500
    expect(alice?.realizedPnL).toBe('200');
    expect(alice?.unrealizedPnL).toBe('300');
    expect(alice?.totalPnL).toBe('500');
    expect(alice?.positionCount).toBe(2);
    expect(alice?.claimCount).toBe(1);
  });

  it('skips unrealized predictor entry when predictorToken is empty', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorCollateral: '500',
        counterpartyCollateral: '500',
        predictorClaimable: '900',
        counterpartyClaimable: '100',
        pickConfiguration: {
          predictorToken: null,
          counterpartyToken: '0xCpToken',
        },
      },
    ]);

    const result = await calculatePositionPnL();
    const predictor = result.find((r) => r.owner === '0xpredictor');

    // Predictor should not appear because predictorToken is null (empty after toLowerCase)
    expect(predictor).toBeUndefined();
    // Counterparty should still appear
    const counterparty = result.find((r) => r.owner === '0xcounterparty');
    expect(counterparty?.unrealizedPnL).toBe('-400');
  });

  it('uses 0 fallback for null claimable fields', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([
      {
        predictor: '0xPredictor',
        counterparty: '0xCounterparty',
        predictorCollateral: '500',
        counterpartyCollateral: '500',
        predictorClaimable: null,
        counterpartyClaimable: null,
        pickConfiguration: {
          predictorToken: '0xPredToken',
          counterpartyToken: '0xCpToken',
        },
      },
    ]);

    const result = await calculatePositionPnL();
    const predictor = result.find((r) => r.owner === '0xpredictor');

    // claimable defaults to 0, so PnL = 0 - 500 = -500
    expect(predictor?.unrealizedPnL).toBe('-500');
  });

  it('filters by owners for claims', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([
      {
        holder: '0xAlice',
        positionToken: '0xToken1',
        collateralPaid: '1500',
        tokensBurned: '1000',
      },
      {
        holder: '0xBob',
        positionToken: '0xToken2',
        collateralPaid: '2000',
        tokensBurned: '1000',
      },
    ]);
    mockPrisma.close.findMany.mockResolvedValue([]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    const result = await calculatePositionPnL(undefined, undefined, [
      '0xAlice',
    ]);
    const owners = result.map((r) => r.owner);

    expect(owners).toContain('0xalice');
    expect(owners).not.toContain('0xbob');
  });

  it('filters by owners for close records', async () => {
    mockPrisma.claim.findMany.mockResolvedValue([]);
    mockPrisma.close.findMany.mockResolvedValue([
      {
        predictorHolder: '0xAlice',
        counterpartyHolder: '0xBob',
        predictorTokensBurned: '1000',
        predictorPayout: '1200',
        counterpartyTokensBurned: '1000',
        counterpartyPayout: '800',
      },
    ]);
    mockPrisma.prediction.findMany.mockResolvedValue([]);

    const result = await calculatePositionPnL(undefined, undefined, [
      '0xAlice',
    ]);
    const owners = result.map((r) => r.owner);

    expect(owners).toContain('0xalice');
    expect(owners).not.toContain('0xbob');
  });

  it('passes chainId and marketAddress in where clauses', async () => {
    setupEmptyMocks();

    await calculatePositionPnL(42, '0xMarket');

    expect(mockPrisma.claim.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        chainId: 42,
        marketAddress: '0xmarket',
      }),
    });
    expect(mockPrisma.close.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        chainId: 42,
        marketAddress: '0xmarket',
      }),
    });
    expect(mockPrisma.prediction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          chainId: 42,
          marketAddress: '0xmarket',
        }),
      })
    );
  });
});

describe('calculateCombinedPositionPnL', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps raw SQL rows to LegacyPositionPnLEntry format', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { address: '0xalice', total_pnl: '5000', position_count: 3n },
      { address: '0xbob', total_pnl: '-2000', position_count: 1n },
    ]);

    const result = await calculateCombinedPositionPnL();

    expect(result).toEqual([
      { owner: '0xalice', totalPnL: '5000', positionCount: 3 },
      { owner: '0xbob', totalPnL: '-2000', positionCount: 1 },
    ]);
  });

  it('returns empty array when no rows returned', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await calculateCombinedPositionPnL();
    expect(result).toEqual([]);
  });
});
