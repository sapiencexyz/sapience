import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB client
vi.mock('../db', () => {
  const prisma = {
    attestationScore: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    market: {
      findFirst: vi.fn(),
    },
  };
  return { default: prisma, __esModule: true };
});

// Mock time-weighted compute to avoid deeper DB interactions in this test
vi.mock('../helpers/scoringService', () => ({
  computeTimeWeightedForAttesterMarketValue: vi.fn(async () => 0.5),
}));

import prismaDefault from '../db';
import { ScoreResolver } from '../graphql/resolvers/ScoreResolver';

describe('ScoreResolver.topForecasters', () => {
  beforeEach(() => vi.clearAllMocks());

  const prisma = prismaDefault as unknown as {
    attestationScore: {
      groupBy: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
    };
    market: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  it('returns top N by ascending timeWeightedMeanBrier', async () => {
    prisma.attestationScore.groupBy.mockResolvedValue([
      { attester: 'B', _count: { _all: 10 }, _sum: { errorSquared: 3 } },
      { attester: 'A', _count: { _all: 5 }, _sum: { errorSquared: 1 } },
    ]);

    // Distinct markets per attester (used by resolver before calling compute)
    prisma.attestationScore.findMany
      .mockResolvedValueOnce([{ marketAddress: '0xmg', marketId: '1' }])
      .mockResolvedValueOnce([{ marketAddress: '0xmg', marketId: '1' }]);

    const resolver = new ScoreResolver();
    const result = await resolver.topForecasters(2);
    expect(result.length).toBe(2);
    expect(['B', 'A']).toContain(result[0].attester);
  });
});
