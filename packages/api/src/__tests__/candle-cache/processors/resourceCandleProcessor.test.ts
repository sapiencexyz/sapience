import { ResourceCandleProcessor } from '../../../candle-cache/processors/resourceCandleProcessor';
import { RuntimeCandleStore } from '../../../candle-cache/runtimeCandleStore';
import { ResourcePrice } from '../../../models/ResourcePrice';
import { Resource } from '../../../models/Resource';
import { CANDLE_CACHE_CONFIG } from '../../../candle-cache/config';

describe('ResourceCandleProcessor', () => {
  let processor: ResourceCandleProcessor;
  let runtimeCandles: RuntimeCandleStore;

  beforeEach(() => {
    runtimeCandles = new RuntimeCandleStore();
    processor = new ResourceCandleProcessor(runtimeCandles);
  });

  it('should create a new candle for a new resource price', async () => {
    const resource = new Resource();
    resource.slug = 'test-resource';

    const price = new ResourcePrice();
    price.resource = Promise.resolve(resource);
    price.timestamp = 1000;
    price.value = '100';

    await processor.processResourcePrice(price);

    const candle = runtimeCandles.getResourceCandle('test-resource', CANDLE_CACHE_CONFIG.intervals[0]);
    expect(candle).toBeDefined();
    expect(candle?.open).toBe('100');
    expect(candle?.high).toBe('100');
    expect(candle?.low).toBe('100');
    expect(candle?.close).toBe('100');
    expect(candle?.timestamp).toBeLessThanOrEqual(1000);
  });

  it('should update existing candle with new price', async () => {
    const resource = new Resource();
    resource.slug = 'test-resource';

    // First price
    const price1 = new ResourcePrice();
    price1.resource = Promise.resolve(resource);
    price1.timestamp = 1000;
    price1.value = '100';

    // Second price
    const price2 = new ResourcePrice();
    price2.resource = Promise.resolve(resource);
    price2.timestamp = 1050;
    price2.value = '150';

    await processor.processResourcePrice(price1);
    await processor.processResourcePrice(price2);

    const candle = runtimeCandles.getResourceCandle('test-resource', CANDLE_CACHE_CONFIG.intervals[0]);
    expect(candle).toBeDefined();
    expect(candle?.open).toBe('100');
    expect(candle?.high).toBe('150');
    expect(candle?.low).toBe('100');
    expect(candle?.close).toBe('150');
  });

  it('should create new candle when price is in new interval', async () => {
    const resource = new Resource();
    resource.slug = 'test-resource';

    // First price in first interval
    const price1 = new ResourcePrice();
    price1.resource = Promise.resolve(resource);
    price1.timestamp = 1000;
    price1.value = '100';

    // Second price in next interval
    const price2 = new ResourcePrice();
    price2.resource = Promise.resolve(resource);
    price2.timestamp = 1000 + CANDLE_CACHE_CONFIG.intervals[0] * 1000; // Next interval
    price2.value = '150';

    await processor.processResourcePrice(price1);
    await processor.processResourcePrice(price2);

    const candle1 = runtimeCandles.getResourceCandle('test-resource', CANDLE_CACHE_CONFIG.intervals[0]);
    const candle2 = runtimeCandles.getResourceCandle('test-resource', CANDLE_CACHE_CONFIG.intervals[0]);

    expect(candle1).toBeDefined();
    expect(candle2).toBeDefined();
    expect(candle1?.close).toBe('100');
    expect(candle2?.open).toBe('150');
  });

  it('should skip processing if price is older than last update', async () => {
    const resource = new Resource();
    resource.slug = 'test-resource';

    // Newer price
    const price1 = new ResourcePrice();
    price1.resource = Promise.resolve(resource);
    price1.timestamp = 2000;
    price1.value = '200';

    // Older price
    const price2 = new ResourcePrice();
    price2.resource = Promise.resolve(resource);
    price2.timestamp = 1000;
    price2.value = '100';

    await processor.processResourcePrice(price1);
    await processor.processResourcePrice(price2);

    const candle = runtimeCandles.getResourceCandle('test-resource', CANDLE_CACHE_CONFIG.intervals[0]);
    expect(candle).toBeDefined();
    expect(candle?.close).toBe('200'); // Should still be 200, not updated by older price
  });
}); 