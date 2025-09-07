import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';
import { scoreSelectedForecastsForSettledMarket } from './scoringService';

vi.mock('../db', () => {
  const prisma = {
    market: { findFirst: vi.fn() },
    attestationScore: { findMany: vi.fn(), updateMany: vi.fn() },
    attestation: { findUnique: vi.fn() },
    $transaction: vi.fn(async () => {}),
  };
  return { default: prisma, __esModule: true };
});

const prisma = dbModule.default as unknown as {
  market: { findFirst: ReturnType<typeof vi.fn> };
  attestationScore: { findMany: ReturnType<typeof vi.fn> };
  attestation: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('scoreSelectedForecastsForSettledMarket idempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does nothing when all selected forecasts already scored', async () => {
    prisma.market.findFirst.mockResolvedValue({
      settled: true,
      endTimestamp: 100,
      settlementPriceD18: BigInt(10n ** 18n),
      minPriceD18: BigInt(0),
      maxPriceD18: BigInt(10n ** 18n),
      market_group: { baseTokenName: 'Yes' },
    });
    // Filter in service uses scoredAt: null, so simulate empty result set
    prisma.attestationScore.findMany.mockResolvedValue([]);

    await scoreSelectedForecastsForSettledMarket('0xMG', '1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
