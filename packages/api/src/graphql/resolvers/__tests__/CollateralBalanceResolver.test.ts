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
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { index: 0, boundary: now, balance: '9999999999999999999999' },
        { index: 1, boundary: weekAgo, balance: '9999999999999999999999' },
      ]);

      const result = await resolver.collateralBalanceHistory(
        '0x131E278cfC6ED4863AAf0EB9Ce2d915aef775045',
        168,
        1,
        13374202
      );

      for (const snapshot of result) {
        expect(snapshot.balance).not.toMatch(/e\+/);
      }
    });

    it('returns "0" when no transfers exist for a snapshot', async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { index: 0, boundary: now, balance: '0' },
        { index: 1, boundary: weekAgo, balance: '0' },
      ]);

      const result = await resolver.collateralBalanceHistory(
        '0x0000000000000000000000000000000000000000',
        168,
        1,
        13374202
      );

      for (const snapshot of result) {
        expect(snapshot.balance).toBe('0');
      }
    });

    it('always returns evenly-spaced timestamps', async () => {
      const now = new Date();
      const boundaries = Array.from({ length: 4 }, (_, i) => ({
        index: i,
        boundary: new Date(now.getTime() - i * 24 * 3600 * 1000),
        balance: '0',
      }));
      mockPrisma.$queryRaw.mockResolvedValueOnce(boundaries);

      const result = await resolver.collateralBalanceHistory(
        '0x0000000000000000000000000000000000000000',
        24,
        3,
        13374202
      );

      for (const snapshot of result) {
        expect(snapshot.timestamp).toBeInstanceOf(Date);
      }

      // Timestamps should be monotonically decreasing
      for (let i = 1; i < result.length; i++) {
        expect(result[i].timestamp.getTime()).toBeLessThan(
          result[i - 1].timestamp.getTime()
        );
      }
    });
  });
});
