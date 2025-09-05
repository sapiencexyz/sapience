import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';
import { upsertAttestationScoreFromAttestation } from './scoringService';

vi.mock('../db', () => {
  const prisma = {
    attestation: { findUnique: vi.fn() },
    market: { findFirst: vi.fn() },
    attestationScore: { upsert: vi.fn() },
  };
  return { default: prisma, __esModule: true };
});

const prisma = dbModule.default as unknown as {
  attestation: { findUnique: ReturnType<typeof vi.fn> };
  market: { findFirst: ReturnType<typeof vi.fn> };
  attestationScore: { upsert: ReturnType<typeof vi.fn> };
};

describe('address normalization in upsertAttestationScoreFromAttestation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lowercases attester and marketAddress', async () => {
    prisma.attestation.findUnique.mockResolvedValue({
      id: 1,
      attester: '0xABCDEF1234',
      marketAddress: '0xDeAdBeEf',
      marketId: '1',
      questionId: '0x0',
      time: 100,
      prediction: '1',
    });
    prisma.market.findFirst.mockResolvedValue(null);

    await upsertAttestationScoreFromAttestation(1);

    expect(prisma.attestationScore.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          attester: '0xabcdef1234',
          marketAddress: '0xdeadbeef',
        }),
      })
    );
  });
});
