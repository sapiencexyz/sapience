import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';
import { selectLatestPreEndForMarket } from './scoringService';

vi.mock('../db', () => {
  const prisma = {
    market: { findFirst: vi.fn() },
    attestationScore: {
      findMany: vi.fn(), // for distinct attesters
      findFirst: vi.fn(), // for latest per attester
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => {
      for (const op of ops) await op;
    }),
  };
  return { default: prisma, __esModule: true };
});

const prisma = dbModule.default as unknown as {
  market: { findFirst: ReturnType<typeof vi.fn> };
  attestationScore: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('selection flipping when a newer pre-end attestation arrives', () => {
  beforeEach(() => vi.clearAllMocks());

  it('flips used flag to the newer pre-end attestation per attester', async () => {
    prisma.market.findFirst.mockResolvedValue({ endTimestamp: 1000 });

    // First pass: one attester exists
    prisma.attestationScore.findMany.mockResolvedValueOnce([
      { attester: '0xatt' },
    ]);
    // Latest for that attester is id 1
    prisma.attestationScore.findFirst.mockResolvedValueOnce({
      attestationId: 1,
      madeAt: 900,
      attester: '0xatt',
    });
    await selectLatestPreEndForMarket('0xMG', '1');
    expect(prisma.attestationScore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attestationId: 1 },
        data: { used: true },
      })
    );

    // Reset update spy
    vi.mocked(prisma.attestationScore.update).mockClear();

    // Second pass: same attester has newer pre-end attestation id 2
    prisma.attestationScore.findMany.mockResolvedValueOnce([
      { attester: '0xatt' },
    ]);
    prisma.attestationScore.findFirst.mockResolvedValueOnce({
      attestationId: 2,
      madeAt: 980,
      attester: '0xatt',
    });
    await selectLatestPreEndForMarket('0xMG', '1');

    expect(prisma.attestationScore.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { used: false } })
    );
    expect(prisma.attestationScore.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { attestationId: 2 },
        data: { used: true },
      })
    );
  });
});
