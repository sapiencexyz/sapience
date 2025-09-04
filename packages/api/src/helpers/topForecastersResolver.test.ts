import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as generated from '../graphql/resolvers/GeneratedResolvers';
import { ScoreResolver } from '../graphql/resolvers/ScoreResolver';

vi.mock('../graphql/resolvers/GeneratedResolvers', () => {
  const prisma = {
    forecasterScore: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  };
  return { prisma, __esModule: true };
});

const prisma = generated.prisma;

describe('ScoreResolver.topForecasters', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns top N by ascending meanBrier', async () => {
    prisma.forecasterScore.findMany.mockResolvedValue([
      { attester: 'B', numScored: 10, sumErrorSquared: 3, meanBrier: 0.3 },
      { attester: 'A', numScored: 5, sumErrorSquared: 1, meanBrier: 0.2 },
    ]);
    const resolver = new ScoreResolver();
    const result = await resolver.topForecasters(2);
    expect(result.length).toBe(2);
    expect(result[0].attester).toBe('B'); // respects DB orderBy asc
  });
});
