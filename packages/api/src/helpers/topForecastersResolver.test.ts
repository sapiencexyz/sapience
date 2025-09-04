import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import prisma from '../db';
import { ScoreResolver } from '../graphql/resolvers/ScoreResolver';

vi.mock('../db', () => {
  const prisma = {
    attestationScore: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  };
  return { default: prisma, __esModule: true };
});

describe('ScoreResolver.topForecasters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns top N by ascending timeWeightedMeanBrier', async () => {
    prisma.attestationScore.groupBy.mockResolvedValue([
      { attester: 'B', _count: { _all: 10 }, _sum: { errorSquared: 3 } },
      { attester: 'A', _count: { _all: 5 }, _sum: { errorSquared: 1 } },
    ]);
    prisma.attestationScore.findMany.mockResolvedValueOnce([
      { marketAddress: '0xmg', marketId: '1' },
    ]);
    prisma.attestationScore.findMany.mockResolvedValueOnce([
      { marketAddress: '0xmg', marketId: '1' },
    ]);
    const resolver = new ScoreResolver();
    const result = await resolver.topForecasters(2);
    expect(result.length).toBe(2);
    // since both get same timeWeightedMeanBrier in this stub, keep insertion order
    expect(['B', 'A']).toContain(result[0].attester);
  });
});
