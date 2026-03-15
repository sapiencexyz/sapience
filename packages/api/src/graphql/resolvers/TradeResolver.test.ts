import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  secondaryTrade: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
};

vi.mock('../../db', () => ({ default: mockPrisma }));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTrade(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    chainId: 13374202,
    tradeHash:
      '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1',
    seller: '0x1111111111111111111111111111111111111111',
    buyer: '0x2222222222222222222222222222222222222222',
    token: '0x3333333333333333333333333333333333333333',
    collateral: '0x4444444444444444444444444444444444444444',
    tokenAmount: '1000000000000000000',
    price: '500000000000000000',
    refCode: null,
    executedAt: 1700000000,
    txHash:
      '0xdef789abc123def789abc123def789abc123def789abc123def789abc123def7',
    blockNumber: 100,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TradeResolver', () => {
  let resolver: InstanceType<typeof import('./TradeResolver').TradeResolver>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { TradeResolver } = await import('./TradeResolver');
    resolver = new TradeResolver();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // trades()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('trades', () => {
    it('returns mapped results with all fields', async () => {
      const trade = makeTrade();
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([trade]);

      const result = await resolver.trades(
        50,
        0,
        '0x1111111111111111111111111111111111111111'
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: trade.id,
        chainId: trade.chainId,
        tradeHash: trade.tradeHash,
        seller: trade.seller,
        buyer: trade.buyer,
        token: trade.token,
        collateral: trade.collateral,
        tokenAmount: trade.tokenAmount,
        price: trade.price,
        refCode: null,
        executedAt: trade.executedAt,
        txHash: trade.txHash,
        blockNumber: trade.blockNumber,
      });
    });

    it('respects take/skip pagination', async () => {
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

      await resolver.trades(
        25,
        10,
        '0x1111111111111111111111111111111111111111'
      );

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith({
        where: { seller: '0x1111111111111111111111111111111111111111' },
        orderBy: { executedAt: 'desc' },
        take: 25,
        skip: 10,
      });
    });

    it('caps take at 100', async () => {
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

      await resolver.trades(
        200,
        0,
        '0x1111111111111111111111111111111111111111'
      );

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      );
    });

    it('returns empty array when no filters provided', async () => {
      const result = await resolver.trades(50, 0);

      expect(result).toEqual([]);
      expect(mockPrisma.secondaryTrade.findMany).not.toHaveBeenCalled();
    });

    it('filters by seller (lowercased)', async () => {
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

      await resolver.trades(
        50,
        0,
        '0xAABBCCDDEE1111111111111111111111111111AA'
      );

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            seller: '0xaabbccddee1111111111111111111111111111aa',
          },
        })
      );
    });

    it('filters by buyer (lowercased)', async () => {
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

      await resolver.trades(
        50,
        0,
        undefined,
        '0xAABBCCDDEE2222222222222222222222222222BB'
      );

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            buyer: '0xaabbccddee2222222222222222222222222222bb',
          },
        })
      );
    });

    it('filters by token (lowercased)', async () => {
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

      await resolver.trades(
        50,
        0,
        undefined,
        undefined,
        '0xAABBCCDDEE3333333333333333333333333333CC'
      );

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            token: '0xaabbccddee3333333333333333333333333333cc',
          },
        })
      );
    });

    it('filters by chainId', async () => {
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

      await resolver.trades(
        50,
        0,
        '0x1111111111111111111111111111111111111111',
        undefined,
        undefined,
        13374202
      );

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            seller: '0x1111111111111111111111111111111111111111',
            chainId: 13374202,
          },
        })
      );
    });

    it('combines multiple filters', async () => {
      mockPrisma.secondaryTrade.findMany.mockResolvedValue([]);

      await resolver.trades(
        50,
        0,
        '0x1111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333',
        13374202
      );

      expect(mockPrisma.secondaryTrade.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            seller: '0x1111111111111111111111111111111111111111',
            buyer: '0x2222222222222222222222222222222222222222',
            token: '0x3333333333333333333333333333333333333333',
            chainId: 13374202,
          },
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // trade()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('trade', () => {
    it('returns a single trade by tradeHash', async () => {
      const trade = makeTrade();
      mockPrisma.secondaryTrade.findUnique.mockResolvedValue(trade);

      const result = await resolver.trade(trade.tradeHash);

      expect(mockPrisma.secondaryTrade.findUnique).toHaveBeenCalledWith({
        where: { tradeHash: trade.tradeHash },
      });
      expect(result).toEqual({
        id: trade.id,
        chainId: trade.chainId,
        tradeHash: trade.tradeHash,
        seller: trade.seller,
        buyer: trade.buyer,
        token: trade.token,
        collateral: trade.collateral,
        tokenAmount: trade.tokenAmount,
        price: trade.price,
        refCode: null,
        executedAt: trade.executedAt,
        txHash: trade.txHash,
        blockNumber: trade.blockNumber,
      });
    });

    it('returns null when not found', async () => {
      mockPrisma.secondaryTrade.findUnique.mockResolvedValue(null);

      const result = await resolver.trade('0xnonexistent');

      expect(result).toBeNull();
    });

    it('lowercases the id', async () => {
      mockPrisma.secondaryTrade.findUnique.mockResolvedValue(null);

      await resolver.trade('0xABCDEF1234567890');

      expect(mockPrisma.secondaryTrade.findUnique).toHaveBeenCalledWith({
        where: { tradeHash: '0xabcdef1234567890' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // tradeCount()
  // ═══════════════════════════════════════════════════════════════════════════

  describe('tradeCount', () => {
    it('returns count matching filters', async () => {
      mockPrisma.secondaryTrade.count.mockResolvedValue(42);

      const result = await resolver.tradeCount(
        '0x1111111111111111111111111111111111111111'
      );

      expect(result).toBe(42);
      expect(mockPrisma.secondaryTrade.count).toHaveBeenCalledWith({
        where: { seller: '0x1111111111111111111111111111111111111111' },
      });
    });

    it('returns 0 when no filters provided', async () => {
      const result = await resolver.tradeCount();

      expect(result).toBe(0);
      expect(mockPrisma.secondaryTrade.count).not.toHaveBeenCalled();
    });
  });
});
