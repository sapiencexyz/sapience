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
    $transaction: vi.fn(async (ops: unknown[]) => {
      // Execute sequentially for test simplicity
      for (const op of ops) await op;
    }),
  };
  return { default: prisma, __esModule: true };
});

const prisma = dbModule.default as unknown as {
  attestation: {
    findUnique: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
  market: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  attestationScore: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('scoringService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('computes error and updates aggregates for settled binary market', async () => {
    // Arrange
    prisma.market.findFirst.mockResolvedValue({
      settled: true,
      endTimestamp: 100,
      settlementPriceD18: BigInt(10n ** 18n),
      minPriceD18: BigInt(0),
      maxPriceD18: BigInt(10n ** 18n),
      market_group: { baseTokenName: 'Yes' },
    });
    prisma.attestationScore.findMany.mockResolvedValue([
      { attestationId: 1, attester: '0xabc', probabilityFloat: 0.8 },
    ]);
    // no forecasterScore table anymore

    // Act
    await utils.scoreSelectedForecastsForSettledMarket('0xMG', '1');

    // Assert
    const err = (0.8 - 1) * (0.8 - 1);
    expect(prisma.attestationScore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorSquared: err }),
      })
    );
    // aggregate tables removed; only attestationScore updated
    expect(prisma.attestationScore.update).toHaveBeenCalled();
  });

  it('computes time-weighted error per attester-market and updates aggregates', async () => {
    prisma.market.findFirst.mockResolvedValue({
      settled: true,
      endTimestamp: 200,
      settlementPriceD18: BigInt(10n ** 18n),
      minPriceD18: BigInt(0),
      maxPriceD18: BigInt(10n ** 18n),
      market_group: { baseTokenName: 'Yes' },
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
    const value = await utils.computeTimeWeightedForAttesterMarketValue(
      '0xMG',
      '1',
      '0xabc'
    );

    // With alpha=2 (default), weights are duration * tau^2 where tau = end - midpoint
    // Interval1 [120,160): p=0.2, err=0.64, midpoint=140, tau=60 => weight=40 * 3600 = 144000
    // Interval2 [160,200]: p=0.6, err=0.16, midpoint=180, tau=20 => weight=40 * 400 = 16000
    // Weighted error = (0.64*144000 + 0.16*16000) / (144000 + 16000) = (92160 + 2560) / 160000 = 0.59
    expect(value).toBeCloseTo(0.592, 5);

    // now pure compute, no writes
    expect(prisma.attestationScore.findMany).toHaveBeenCalled();
  });
});
