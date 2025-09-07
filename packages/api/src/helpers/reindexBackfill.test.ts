import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';
import { reindexAccuracy } from '../workers/jobs/reindexAccuracy';
import * as scoring from './scoringService';

vi.mock('../db', () => {
  const prisma = {
    attestation: { findMany: vi.fn() },
    market: { findMany: vi.fn() },
  };
  const initializeDataSource = vi.fn();
  return { default: prisma, initializeDataSource, __esModule: true };
});

vi.mock('./scoringService', async () => {
  const mod =
    await vi.importActual<typeof import('./scoringService')>(
      './scoringService'
    );
  return {
    ...mod,
    upsertAttestationScoreFromAttestation: vi.fn(),
    selectLatestPreEndForMarket: vi.fn(),
    scoreSelectedForecastsForSettledMarket: vi.fn(),
    scoreTimeWeightedForSettledMarket: vi.fn(),
  };
});

const prisma = dbModule.default as unknown as {
  attestation: { findMany: ReturnType<typeof vi.fn> };
  market: { findMany: ReturnType<typeof vi.fn> };
};

describe('reindexAccuracy', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scoped to address and marketId calls scoring routines', async () => {
    prisma.attestation.findMany.mockResolvedValue([{ id: 1 }]);

    await reindexAccuracy('0xMG', '1');

    expect(scoring.upsertAttestationScoreFromAttestation).toHaveBeenCalledWith(
      1
    );

    expect(scoring.scoreSelectedForecastsForSettledMarket).toHaveBeenCalledWith(
      '0xmg',
      '1'
    );
  });
});
