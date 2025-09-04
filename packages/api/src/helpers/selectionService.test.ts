import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as dbModule from '../db';
import { selectLatestPreEndForMarket } from './scoringService';

vi.mock('../db', () => {
  const prisma = {
    market: { findFirst: vi.fn() },
    attestationScore: {
      findMany: vi.fn(), // used for distinct attesters
      findFirst: vi.fn(), // used to get latest per attester
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => {
      for (const op of ops) await op;
    }),
  };
  return { default: prisma, __esModule: true };
});
const prisma = dbModule.default;

describe('selectLatestPreEndForMarket', () => {
  beforeEach(() => vi.clearAllMocks());

  it('selects the latest pre-end attestation per attester and unselects others', async () => {
    prisma.market.findFirst.mockResolvedValue({ endTimestamp: 1000 });
    // First, service queries distinct attesters
    prisma.attestationScore.findMany.mockResolvedValueOnce([
      { attester: '0xatt' },
    ]);
    // Then, for that attester, latest pre-end attestation
    prisma.attestationScore.findFirst.mockResolvedValueOnce({
      attestationId: 2,
      madeAt: 950,
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

  it('ignores late forecasts (post-end)', async () => {
    prisma.market.findFirst.mockResolvedValue({ endTimestamp: 1000 });
    // Distinct attesters empty
    prisma.attestationScore.findMany.mockResolvedValue([]);

    await selectLatestPreEndForMarket('0xMG', '1');
    // No selection if none are pre-end
    expect(prisma.attestationScore.update).not.toHaveBeenCalled();
  });
});
