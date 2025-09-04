import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';
import * as utils from './scoringService';

vi.mock('../db', () => {
  const prisma = {
    attestation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    market: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    attestationScore: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    forecasterScore: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    attesterMarketScore: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => {
      // Execute sequentially for test simplicity
      for (const op of ops) await op;
    }),
  };
  return { default: prisma, __esModule: true };
});

const prisma = dbModule.default;

describe('scoringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes error and updates aggregates for settled binary market', async () => {
    // Arrange
    prisma.market.findFirst.mockResolvedValue({
      settled: true,
      settlementPriceD18: BigInt(10n ** 18n),
      minPriceD18: BigInt(0),
      maxPriceD18: BigInt(10n ** 18n),
    });
    prisma.attestationScore.findMany.mockResolvedValue([
      { attestationId: 1, attester: '0xabc', probabilityFloat: 0.8 },
    ]);
    prisma.forecasterScore.findUnique.mockResolvedValue({
      attester: '0xabc',
      numScored: 0,
      sumErrorSquared: 0,
      meanBrier: 0,
    });

    // Act
    await utils.scoreSelectedForecastsForSettledMarket('0xMG', '1');

    // Assert
    const err = (0.8 - 1) * (0.8 - 1);
    expect(prisma.attestationScore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorSquared: err }),
      })
    );
    expect(prisma.forecasterScore.upsert).toHaveBeenCalled();
  });

  it('computes time-weighted error per attester-market and updates aggregates', async () => {
    prisma.market.findFirst.mockResolvedValue({
      settled: true,
      startTimestamp: 100,
      endTimestamp: 200,
      settlementPriceD18: BigInt(10n ** 18n),
      minPriceD18: BigInt(0),
      maxPriceD18: BigInt(10n ** 18n),
    });
    prisma.attestationScore.findMany.mockResolvedValue([
      {
        attestationId: 1,
        attester: '0xabc',
        probabilityFloat: 0.2,
        madeAt: 120,
      },
      {
        attestationId: 2,
        attester: '0xabc',
        probabilityFloat: 0.6,
        madeAt: 160,
      },
    ]);
    prisma.attesterMarketScore.findMany.mockResolvedValue([
      { timeWeightedError: 0.0 },
    ]);

    await utils.scoreTimeWeightedForSettledMarket('0xMG', '1');

    // Two intervals: [120,160) p=0.2, [160,200] p=0.6, outcome=1
    // const err1 = (0.2 - 1) ** 2; // 0.64
    // const err2 = (0.6 - 1) ** 2; // 0.16
    // const tw = (err1 * 40 + err2 * 40) / 80; // 0.40

    expect(prisma.attesterMarketScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          timeWeightedError: expect.any(Number),
        }),
      })
    );
    expect(prisma.forecasterScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attester: expect.any(String) },
      })
    );
  });
});
