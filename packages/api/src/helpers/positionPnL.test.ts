import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock('../db', () => ({ default: mockPrisma }));

import { calculateCombinedPositionPnL } from './positionPnL';

describe('calculateCombinedPositionPnL', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps raw SQL rows to LegacyPositionPnLEntry format', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { address: '0xalice', total_pnl: '5000', position_count: 3n },
      { address: '0xbob', total_pnl: '-2000', position_count: 1n },
    ]);

    const result = await calculateCombinedPositionPnL();

    expect(result).toEqual([
      { owner: '0xalice', totalPnL: '5000', positionCount: 3 },
      { owner: '0xbob', totalPnL: '-2000', positionCount: 1 },
    ]);
  });

  it('returns empty array when no rows returned', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await calculateCombinedPositionPnL();
    expect(result).toEqual([]);
  });
});
