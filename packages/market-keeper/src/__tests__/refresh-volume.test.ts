import { describe, it, expect } from 'vitest';
import {
  aggregateVolumes,
  compactConditionVolumes,
  type ConditionVolume,
  type DataApiTrade,
} from '../refresh-volume/index';

// Fixed "now" for deterministic tests
const NOW = 1700000000;

function makeTrade(overrides: Partial<DataApiTrade> = {}): DataApiTrade {
  return {
    conditionId: '0xabc',
    size: 100,
    price: 0.5,
    timestamp: NOW - 1800, // 30 min ago (within 1h)
    transactionHash: `0x${Math.random().toString(16).slice(2)}`,
    ...overrides,
  };
}

describe('compactConditionVolumes', () => {
  it('drops failed fetch holes before submission', () => {
    const good: ConditionVolume = {
      id: '0xabc',
      similarMarketVolume1h: 1,
      similarMarketVolume4h: 2,
      similarMarketVolume24h: 3,
      similarMarketVolume7d: 4,
      similarMarketVolumeFiltered1h: 0,
      similarMarketVolumeFiltered4h: 0,
      similarMarketVolumeFiltered24h: 0,
      similarMarketVolumeFiltered7d: 0,
    };

    expect(compactConditionVolumes([good, undefined])).toEqual([good]);
  });
});

describe('aggregateVolumes', () => {
  it('returns zeroes for conditions with no trades', () => {
    const result = aggregateVolumes([], ['0xabc', '0xdef'], NOW);
    expect(result).toHaveLength(2);
    for (const v of result) {
      expect(v.similarMarketVolume1h).toBe(0);
      expect(v.similarMarketVolume4h).toBe(0);
      expect(v.similarMarketVolume24h).toBe(0);
      expect(v.similarMarketVolume7d).toBe(0);
      expect(v.similarMarketVolumeFiltered1h).toBe(0);
      expect(v.similarMarketVolumeFiltered4h).toBe(0);
      expect(v.similarMarketVolumeFiltered24h).toBe(0);
      expect(v.similarMarketVolumeFiltered7d).toBe(0);
    }
  });

  it('buckets trades into correct time windows', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ timestamp: NOW - 1800, size: 10 }), // 30m ago → 1h, 4h, 24h, 7d
      makeTrade({ timestamp: NOW - 7200, size: 20 }), // 2h ago  → 4h, 24h, 7d
      makeTrade({ timestamp: NOW - 43200, size: 30 }), // 12h ago → 24h, 7d
      makeTrade({ timestamp: NOW - 259200, size: 40 }), // 3d ago  → 7d only
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

    expect(result.similarMarketVolume1h).toBe(10);
    expect(result.similarMarketVolume4h).toBe(30); // 10 + 20
    expect(result.similarMarketVolume24h).toBe(60); // 10 + 20 + 30
    expect(result.similarMarketVolume7d).toBe(100); // 10 + 20 + 30 + 40
  });

  it('includes all trades regardless of price', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ price: 0.5, size: 100 }),
      makeTrade({ price: 0.001, size: 200 }),
      makeTrade({ price: 0.999, size: 300 }),
      makeTrade({ price: 0.01, size: 50 }),
      makeTrade({ price: 0.99, size: 75 }),
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    expect(result.similarMarketVolume1h).toBe(725);
  });

  it('ignores trades from unknown condition IDs', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ conditionId: '0xunknown', size: 999 }),
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    expect(result.similarMarketVolume7d).toBe(0);
  });

  it('aggregates across multiple conditions independently', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ conditionId: '0xabc', size: 100 }),
      makeTrade({ conditionId: '0xdef', size: 200 }),
      makeTrade({ conditionId: '0xabc', size: 50 }),
    ];

    const result = aggregateVolumes(trades, ['0xabc', '0xdef'], NOW);
    const abc = result.find((v) => v.id === '0xabc')!;
    const def = result.find((v) => v.id === '0xdef')!;

    expect(abc.similarMarketVolume1h).toBe(150);
    expect(def.similarMarketVolume1h).toBe(200);
  });

  it('handles trade exactly at time window cutoff', () => {
    // Trade exactly at 1h boundary — timestamp === NOW - 3600
    const trades: DataApiTrade[] = [
      makeTrade({ timestamp: NOW - 3600, size: 100 }), // exactly at 1h cutoff
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    // >= cutoff, so included in 1h
    expect(result.similarMarketVolume1h).toBe(100);
    expect(result.similarMarketVolume4h).toBe(100);
  });

  it('excludes trade just before time window cutoff', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ timestamp: NOW - 3601, size: 100 }), // 1 second before 1h cutoff
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    expect(result.similarMarketVolume1h).toBe(0);
    expect(result.similarMarketVolume4h).toBe(100); // still within 4h
  });

  it('aggregates all trades across time windows regardless of price', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ timestamp: NOW - 1800, price: 0.001, size: 50 }), // 30m ago
      makeTrade({ timestamp: NOW - 7200, price: 0.001, size: 100 }), // 2h ago
      makeTrade({ timestamp: NOW - 1800, price: 0.5, size: 200 }), // 30m ago
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

    expect(result.similarMarketVolume1h).toBe(250); // 50 + 200
    expect(result.similarMarketVolume4h).toBe(350); // 50 + 100 + 200
  });

  describe('filtered volume (excludes extreme-odds trades outside [0.01, 0.99])', () => {
    it('excludes trades priced below 0.01 from filtered buckets', () => {
      const trades: DataApiTrade[] = [
        makeTrade({ price: 0.5, size: 100 }), // within bounds → included
        makeTrade({ price: 0.009, size: 200 }), // below min → excluded from filtered
      ];

      const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

      expect(result.similarMarketVolume1h).toBe(300); // all trades
      expect(result.similarMarketVolumeFiltered1h).toBe(100); // only in-bounds
    });

    it('excludes trades priced above 0.99 from filtered buckets', () => {
      const trades: DataApiTrade[] = [
        makeTrade({ price: 0.5, size: 100 }), // within bounds → included
        makeTrade({ price: 0.995, size: 300 }), // above max → excluded from filtered
      ];

      const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

      expect(result.similarMarketVolume1h).toBe(400);
      expect(result.similarMarketVolumeFiltered1h).toBe(100);
    });

    it('includes trades at exactly the boundary prices (0.01 and 0.99)', () => {
      const trades: DataApiTrade[] = [
        makeTrade({ price: 0.01, size: 50 }),
        makeTrade({ price: 0.99, size: 75 }),
      ];

      const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

      expect(result.similarMarketVolumeFiltered1h).toBe(125);
    });

    it('dual-accumulates into both regular and filtered buckets for in-bounds trades', () => {
      const trades: DataApiTrade[] = [
        makeTrade({ timestamp: NOW - 1800, price: 0.5, size: 100 }), // 30m: 1h,4h,24h,7d
        makeTrade({ timestamp: NOW - 7200, price: 0.5, size: 200 }), // 2h: 4h,24h,7d
        makeTrade({ timestamp: NOW - 43200, price: 0.5, size: 300 }), // 12h: 24h,7d
        makeTrade({ timestamp: NOW - 259200, price: 0.5, size: 400 }), // 3d: 7d only
      ];

      const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

      // Regular and filtered should be identical (all trades are in-bounds)
      expect(result.similarMarketVolume1h).toBe(
        result.similarMarketVolumeFiltered1h
      );
      expect(result.similarMarketVolume4h).toBe(
        result.similarMarketVolumeFiltered4h
      );
      expect(result.similarMarketVolume24h).toBe(
        result.similarMarketVolumeFiltered24h
      );
      expect(result.similarMarketVolume7d).toBe(
        result.similarMarketVolumeFiltered7d
      );

      expect(result.similarMarketVolumeFiltered1h).toBe(100);
      expect(result.similarMarketVolumeFiltered4h).toBe(300); // 100 + 200
      expect(result.similarMarketVolumeFiltered24h).toBe(600); // 100 + 200 + 300
      expect(result.similarMarketVolumeFiltered7d).toBe(1000); // all
    });

    it('extreme-price trades count in regular but not in filtered buckets', () => {
      const trades: DataApiTrade[] = [
        makeTrade({ timestamp: NOW - 1800, price: 0.5, size: 100 }), // in-bounds
        makeTrade({ timestamp: NOW - 1800, price: 0.001, size: 999 }), // extreme low
        makeTrade({ timestamp: NOW - 1800, price: 0.999, size: 888 }), // extreme high
      ];

      const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

      expect(result.similarMarketVolume1h).toBe(1987); // all
      expect(result.similarMarketVolumeFiltered1h).toBe(100); // only in-bounds
      expect(result.similarMarketVolume7d).toBe(1987);
      expect(result.similarMarketVolumeFiltered7d).toBe(100);
    });

    it('correctly buckets filtered trades by time window', () => {
      const trades: DataApiTrade[] = [
        makeTrade({ timestamp: NOW - 1800, price: 0.5, size: 10 }), // 30m: in-bounds, 1h
        makeTrade({ timestamp: NOW - 7200, price: 0.5, size: 20 }), // 2h: in-bounds, 4h
        makeTrade({ timestamp: NOW - 1800, price: 0.001, size: 999 }), // 30m: extreme, all windows
        makeTrade({ timestamp: NOW - 7200, price: 0.999, size: 888 }), // 2h: extreme, 4h+
      ];

      const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

      expect(result.similarMarketVolumeFiltered1h).toBe(10); // only in-bounds within 1h
      expect(result.similarMarketVolumeFiltered4h).toBe(30); // in-bounds within 4h
      expect(result.similarMarketVolumeFiltered24h).toBe(30); // same as 4h (no 24h-only in-bounds)
      expect(result.similarMarketVolumeFiltered7d).toBe(30); // same
    });
  });
});
