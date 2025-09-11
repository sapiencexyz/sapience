import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB client
vi.mock('../db', () => {
  const prisma = {
    attestationScore: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    attesterMarketTwError: {
      groupBy: vi.fn(),
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
    attesterMarketTwError: {
      groupBy: ReturnType<typeof vi.fn>;
    };
    market: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };

  it('returns top N by descending accuracyScore', async () => {
    // Provide averages so B has higher accuracy (1/mean)
    prisma.attesterMarketTwError.groupBy.mockResolvedValue([
      { attester: 'B', _avg: { twError: 0.3 } },
      { attester: 'A', _avg: { twError: 0.5 } },
    ]);

    const resolver = new ScoreResolver();
    const result = await resolver.topForecasters(2);
    expect(result.length).toBe(2);
    expect(result[0].accuracyScore).toBeGreaterThanOrEqual(
      result[1].accuracyScore
    );
    // ensure ordering by accuracy desc (B should be first)
    expect(result[0].attester).toBe('b');
    expect(result[1].attester).toBe('a');
  });
});
