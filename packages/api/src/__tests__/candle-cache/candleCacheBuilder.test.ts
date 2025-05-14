import { CandleCacheBuilder } from '../../candle-cache/candleCacheBuilder';
import { ResourcePrice } from '../../models/ResourcePrice';
import { CANDLE_CACHE_CONFIG } from '../../candle-cache/config';
import * as dbUtils from '../../candle-cache/dbUtils';

// Mock the database utilities
jest.mock('../../candle-cache/dbUtils', () => ({
  getParam: jest.fn(),
  setParam: jest.fn(),
  getResourcePrices: jest.fn(),
  getResourcePricesCount: jest.fn(),
  truncateCandlesTable: jest.fn(),
  saveCandle: jest.fn(),
}));

describe('CandleCacheBuilder', () => {
  let builder: CandleCacheBuilder;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock default return values
    (dbUtils.getParam as jest.Mock).mockResolvedValue(0);
    (dbUtils.getResourcePricesCount as jest.Mock).mockResolvedValue(0);
    (dbUtils.getResourcePrices as jest.Mock).mockResolvedValue({ prices: [], hasMore: false });
    
    builder = CandleCacheBuilder.getInstance();
  });

  describe('updateCandles', () => {
    it('should perform a hard refresh when needed', async () => {
      // Mock that hard refresh is needed
      (dbUtils.getParam as jest.Mock).mockResolvedValueOnce(1);

      await builder.updateCandles();

      expect(dbUtils.truncateCandlesTable).toHaveBeenCalled();
      expect(dbUtils.setParam).toHaveBeenCalledWith(CANDLE_CACHE_CONFIG.hardRefresh, 0);
      expect(dbUtils.setParam).toHaveBeenCalledWith(CANDLE_CACHE_CONFIG.lastProcessedResourcePrice, 0);
      expect(dbUtils.setParam).toHaveBeenCalledWith(CANDLE_CACHE_CONFIG.lastProcessedMarketPrice, 0);
    });

    it('should process resource prices in batches', async () => {
      const mockPrices = [
        {
          resource: { slug: 'test-resource' },
          timestamp: 1000,
          value: '100',
        } as ResourcePrice,
      ];

      // Mock that we have prices to process
      (dbUtils.getResourcePricesCount as jest.Mock).mockResolvedValue(1);
      (dbUtils.getResourcePrices as jest.Mock).mockResolvedValue({
        prices: mockPrices,
        hasMore: false,
      });

      await builder.updateCandles();

      expect(dbUtils.getResourcePrices).toHaveBeenCalled();
      expect(dbUtils.saveCandle).toHaveBeenCalled();
    });

    it('should handle empty price batches', async () => {
      // Mock empty price batch
      (dbUtils.getResourcePricesCount as jest.Mock).mockResolvedValue(0);
      (dbUtils.getResourcePrices as jest.Mock).mockResolvedValue({
        prices: [],
        hasMore: false,
      });

      await builder.updateCandles();

      expect(dbUtils.getResourcePrices).toHaveBeenCalled();
      expect(dbUtils.saveCandle).not.toHaveBeenCalled();
    });

    it('should process multiple batches when hasMore is true', async () => {
      const mockPrices1 = [
        {
          resource: { slug: 'test-resource' },
          timestamp: 1000,
          value: '100',
        } as ResourcePrice,
      ];

      const mockPrices2 = [
        {
          resource: { slug: 'test-resource' },
          timestamp: 2000,
          value: '200',
        } as ResourcePrice,
      ];

      // Mock two batches of prices
      (dbUtils.getResourcePricesCount as jest.Mock).mockResolvedValue(2);
      (dbUtils.getResourcePrices as jest.Mock)
        .mockResolvedValueOnce({
          prices: mockPrices1,
          hasMore: true,
        })
        .mockResolvedValueOnce({
          prices: mockPrices2,
          hasMore: false,
        });

      await builder.updateCandles();

      expect(dbUtils.getResourcePrices).toHaveBeenCalledTimes(2);
      expect(dbUtils.saveCandle).toHaveBeenCalledTimes(2);
    });
  });
}); 