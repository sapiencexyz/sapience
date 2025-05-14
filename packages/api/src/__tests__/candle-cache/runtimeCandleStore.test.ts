import { RuntimeCandleStore } from '../../candle-cache/runtimeCandleStore';
import { CacheCandle } from '../../models/CacheCandle';

describe('RuntimeCandleStore', () => {
  let store: RuntimeCandleStore;

  beforeEach(() => {
    store = new RuntimeCandleStore();
  });

  describe('Resource Candles', () => {
    it('should set and get a resource candle', () => {
      const candle = new CacheCandle();
      candle.resourceSlug = 'test-resource';
      candle.interval = 60;
      candle.open = '100';
      candle.high = '150';
      candle.low = '50';
      candle.close = '120';

      store.setResourceCandle('test-resource', 60, candle);
      const retrievedCandle = store.getResourceCandle('test-resource', 60);

      expect(retrievedCandle).toBeDefined();
      expect(retrievedCandle?.resourceSlug).toBe('test-resource');
      expect(retrievedCandle?.interval).toBe(60);
      expect(retrievedCandle?.open).toBe('100');
      expect(retrievedCandle?.high).toBe('150');
      expect(retrievedCandle?.low).toBe('50');
      expect(retrievedCandle?.close).toBe('120');
    });

    it('should return undefined for non-existent resource candle', () => {
      const candle = store.getResourceCandle('non-existent', 60);
      expect(candle).toBeUndefined();
    });

    it('should get all resource candles for a specific resource', () => {
      const candle1 = new CacheCandle();
      candle1.resourceSlug = 'test-resource';
      candle1.interval = 60;
      candle1.open = '100';

      const candle2 = new CacheCandle();
      candle2.resourceSlug = 'test-resource';
      candle2.interval = 300;
      candle2.open = '200';

      store.setResourceCandle('test-resource', 60, candle1);
      store.setResourceCandle('test-resource', 300, candle2);

      const candles = store.getAllResourceCandles('test-resource');

      expect(candles.size).toBe(2);
      expect(candles.get(60)?.open).toBe('100');
      expect(candles.get(300)?.open).toBe('200');
    });

    it('should check if a resource has candles', () => {
      expect(store.hasResourceCandles('test-resource')).toBe(false);

      const candle = new CacheCandle();
      candle.resourceSlug = 'test-resource';
      candle.interval = 60;
      store.setResourceCandle('test-resource', 60, candle);

      expect(store.hasResourceCandles('test-resource')).toBe(true);
    });
  });
}); 