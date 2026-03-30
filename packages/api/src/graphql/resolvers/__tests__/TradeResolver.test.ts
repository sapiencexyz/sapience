import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = vi.hoisted(() => ({
  secondaryTrade: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock('../../../db', () => ({ default: mockPrisma }));

import { TradeResolver } from '../TradeResolver';

describe('TradeResolver', () => {
  let resolver: TradeResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    resolver = new TradeResolver();
    mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);
  });

  describe('trades', () => {
    it('uses OR filter when address is provided', async () => {
      await resolver.trades(20, 0, '0xAlice');

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ seller: '0xalice' }, { buyer: '0xalice' }] },
        })
      );
    });

    it('uses separate seller/buyer filters when no address', async () => {
      await resolver.trades(20, 0, undefined, '0xSeller', '0xBuyer');

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            seller: '0xseller',
            buyer: '0xbuyer',
          }),
        })
      );
    });

    it('throws when address is combined with seller', async () => {
      await expect(
        resolver.trades(20, 0, '0xAlice', '0xSeller')
      ).rejects.toThrow('Cannot combine "address" with "seller" or "buyer"');
    });

    it('throws when address is combined with buyer', async () => {
      await expect(
        resolver.trades(20, 0, '0xAlice', undefined, '0xBuyer')
      ).rejects.toThrow('Cannot combine "address" with "seller" or "buyer"');
    });

    it('caps take at 100', async () => {
      await resolver.trades(500, 0);

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });

    it('lowercases all address filters', async () => {
      await resolver.trades(20, 0, undefined, '0xABC', '0xDEF', '0xTOKEN', 1);

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            seller: '0xabc',
            buyer: '0xdef',
            token: '0xtoken',
            chainId: 1,
          }),
        })
      );
    });
  });
});
