import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  keyValueStore: {
    findUnique: vi.fn(),
  },
  collateralTransfer: {
    findMany: vi.fn(),
  },
}));

vi.mock('../../../db', () => ({ default: mockPrisma }));

import { CollateralBalanceResolver } from '../CollateralBalanceResolver';

describe('CollateralBalanceResolver', () => {
  let resolver: CollateralBalanceResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new CollateralBalanceResolver();
  });

  describe('collateralBalance', () => {
    it('returns full integer string for large balances without scientific notation', async () => {
      // Simulate Postgres returning a large numeric as TEXT
      mockPrisma.$queryRaw.mockResolvedValue([
        { balance: '1160999995177160512307' },
      ]);

      const result = await resolver.collateralBalance(
        '0x131E278cfC6ED4863AAf0EB9Ce2d915aef775045',
        13374202
      );

      expect(result.balance).toBe('1160999995177160512307');
      expect(result.balance).not.toMatch(/e\+/); // no scientific notation
    });

    it('returns "0" when no transfers exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ balance: '0' }]);

      const result = await resolver.collateralBalance(
        '0x0000000000000000000000000000000000000000',
        13374202
      );

      expect(result.balance).toBe('0');
    });

    it('returns "0" when query result is null', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ balance: null }]);

      const result = await resolver.collateralBalance(
        '0x0000000000000000000000000000000000000000',
        13374202
      );

      expect(result.balance).toBe('0');
    });

    it('lowercases the address', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ balance: '100' }]);

      const result = await resolver.collateralBalance(
        '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
        13374202
      );

      expect(result.address).toBe('0xabcdef1234567890abcdef1234567890abcdef12');
    });

    it('passes atBlock when provided', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ balance: '500' }]);

      const result = await resolver.collateralBalance(
        '0x131E278cfC6ED4863AAf0EB9Ce2d915aef775045',
        13374202,
        1000000
      );

      expect(result.atBlock).toBe(1000000);
      expect(result.balance).toBe('500');
    });

    it('returns negative balance as full string', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { balance: '-999999999999999999999' },
      ]);

      const result = await resolver.collateralBalance(
        '0x131E278cfC6ED4863AAf0EB9Ce2d915aef775045',
        13374202
      );

      expect(result.balance).toBe('-999999999999999999999');
      expect(result.balance).not.toMatch(/e\+/);
    });
  });

  describe('collateralBalanceHistory', () => {
    it('returns full integer strings without scientific notation', async () => {
      mockPrisma.keyValueStore.findUnique.mockResolvedValue({
        value: '2000000',
      });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          index: 0,
          atBlock: 2000000,
          balance: '9999999999999999999999',
          measuredTs: new Date('2026-03-01'),
        },
        {
          index: 1,
          atBlock: 1534153,
          balance: '9999999999999999999999',
          measuredTs: new Date('2026-02-22'),
        },
      ]);

      const result = await resolver.collateralBalanceHistory(
        '0x131E278cfC6ED4863AAf0EB9Ce2d915aef775045',
        null,
        168,
        1,
        13374202
      );

      for (const snapshot of result) {
        expect(snapshot.balance).not.toMatch(/e\+/);
      }
    });

    it('returns "0" when no transfers exist for a snapshot', async () => {
      mockPrisma.keyValueStore.findUnique.mockResolvedValue({
        value: '2000000',
      });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          index: 0,
          atBlock: 2000000,
          balance: '0',
          measuredTs: new Date('2026-03-01'),
        },
        {
          index: 1,
          atBlock: 1534153,
          balance: '0',
          measuredTs: new Date('2026-02-22'),
        },
      ]);

      const result = await resolver.collateralBalanceHistory(
        '0x0000000000000000000000000000000000000000',
        null,
        168,
        1,
        13374202
      );

      for (const snapshot of result) {
        expect(snapshot.balance).toBe('0');
      }
    });

    it('uses real measured timestamps from the CTE when present', async () => {
      mockPrisma.keyValueStore.findUnique.mockResolvedValue({
        value: '2000000',
      });
      const realTs0 = new Date('2026-03-01T12:34:56Z');
      const realTs1 = new Date('2026-02-22T08:15:00Z');
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { index: 0, atBlock: 2000000, balance: '500', measuredTs: realTs0 },
        { index: 1, atBlock: 1534153, balance: '300', measuredTs: realTs1 },
      ]);

      const result = await resolver.collateralBalanceHistory(
        '0x131E278cfC6ED4863AAf0EB9Ce2d915aef775045',
        null,
        168,
        1,
        13374202
      );

      // Real measured timestamps come straight through, not extrapolated.
      expect(result[0].timestamp.getTime()).toBe(realTs0.getTime());
      expect(result[1].timestamp.getTime()).toBe(realTs1.getTime());
    });

    it('falls back to extrapolation only when measuredTs is null (empty wallet)', async () => {
      mockPrisma.keyValueStore.findUnique.mockResolvedValue({
        value: '2000000',
      });
      // Wallet with zero historical activity → CTE returns null measuredTs
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { index: 0, atBlock: 2000000, balance: '0', measuredTs: null },
        { index: 1, atBlock: 1534153, balance: '0', measuredTs: null },
        { index: 2, atBlock: 1068306, balance: '0', measuredTs: null },
        { index: 3, atBlock: 602459, balance: '0', measuredTs: null },
      ]);

      const before = Date.now();
      const result = await resolver.collateralBalanceHistory(
        '0x0000000000000000000000000000000000000000',
        null,
        168,
        3,
        13374202
      );
      const after = Date.now();

      // Schema is Date! — every snapshot must have a real Date instance.
      for (const snapshot of result) {
        expect(snapshot.timestamp).toBeInstanceOf(Date);
        expect(snapshot.timestamp.getTime()).not.toBe(0);
      }

      // Index 0 (head) extrapolates from "now" with zero block delta,
      // so it should land between the resolver's start and end clock.
      expect(result[0].timestamp.getTime()).toBeGreaterThanOrEqual(before);
      expect(result[0].timestamp.getTime()).toBeLessThanOrEqual(after);

      // Older snapshots are progressively further in the past — monotonic.
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp.getTime()).toBeLessThan(
          result[i - 1].timestamp.getTime()
        );
      }
    });
  });
});
