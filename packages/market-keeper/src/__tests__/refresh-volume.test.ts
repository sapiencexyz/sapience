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
      volume1h: 1,
      volume4h: 2,
      volume24h: 3,
      volume7d: 4,
      volumeFiltered1h: 1,
      volumeFiltered4h: 2,
      volumeFiltered24h: 3,
      volumeFiltered7d: 4,
    };

    expect(compactConditionVolumes([good, undefined])).toEqual([good]);
  });
});

describe('aggregateVolumes', () => {
  it('returns zeroes for conditions with no trades', () => {
    const result = aggregateVolumes([], ['0xabc', '0xdef'], NOW);
    expect(result).toHaveLength(2);
    for (const v of result) {
      expect(v.volume1h).toBe(0);
      expect(v.volume4h).toBe(0);
      expect(v.volume24h).toBe(0);
      expect(v.volume7d).toBe(0);
      expect(v.volumeFiltered1h).toBe(0);
      expect(v.volumeFiltered4h).toBe(0);
      expect(v.volumeFiltered24h).toBe(0);
      expect(v.volumeFiltered7d).toBe(0);
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

    expect(result.volume1h).toBe(10);
    expect(result.volume4h).toBe(30); // 10 + 20
    expect(result.volume24h).toBe(60); // 10 + 20 + 30
    expect(result.volume7d).toBe(100); // 10 + 20 + 30 + 40
  });

  it('filters trades by price [0.01, 0.99] for filtered volumes', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ price: 0.5, size: 100 }), // in range
      makeTrade({ price: 0.001, size: 200 }), // below range
      makeTrade({ price: 0.999, size: 300 }), // above range
      makeTrade({ price: 0.01, size: 50 }), // boundary — included
      makeTrade({ price: 0.99, size: 75 }), // boundary — included
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

    // Raw volume: all trades
    expect(result.volume1h).toBe(725);
    // Filtered volume: 100 + 50 + 75 = 225 (excludes 0.001 and 0.999)
    expect(result.volumeFiltered1h).toBe(225);
  });

  it('includes boundary prices 0.01 and 0.99 in filtered volume', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ price: 0.01, size: 10 }),
      makeTrade({ price: 0.99, size: 20 }),
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    expect(result.volumeFiltered1h).toBe(30);
  });

  it('excludes prices just outside [0.01, 0.99]', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ price: 0.009, size: 10 }),
      makeTrade({ price: 0.991, size: 20 }),
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    expect(result.volume1h).toBe(30);
    expect(result.volumeFiltered1h).toBe(0);
  });

  it('ignores trades from unknown condition IDs', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ conditionId: '0xunknown', size: 999 }),
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    expect(result.volume7d).toBe(0);
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

    expect(abc.volume1h).toBe(150);
    expect(def.volume1h).toBe(200);
  });

  it('handles trade exactly at time window cutoff', () => {
    // Trade exactly at 1h boundary — timestamp === NOW - 3600
    const trades: DataApiTrade[] = [
      makeTrade({ timestamp: NOW - 3600, size: 100 }), // exactly at 1h cutoff
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    // >= cutoff, so included in 1h
    expect(result.volume1h).toBe(100);
    expect(result.volume4h).toBe(100);
  });

  it('excludes trade just before time window cutoff', () => {
    const trades: DataApiTrade[] = [
      makeTrade({ timestamp: NOW - 3601, size: 100 }), // 1 second before 1h cutoff
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);
    expect(result.volume1h).toBe(0);
    expect(result.volume4h).toBe(100); // still within 4h
  });

  it('applies filtered volume across all time windows', () => {
    const trades: DataApiTrade[] = [
      // Low odds trade at different times
      makeTrade({ timestamp: NOW - 1800, price: 0.001, size: 50 }), // 30m ago
      makeTrade({ timestamp: NOW - 7200, price: 0.001, size: 100 }), // 2h ago
      // Normal trade
      makeTrade({ timestamp: NOW - 1800, price: 0.5, size: 200 }), // 30m ago
    ];

    const [result] = aggregateVolumes(trades, ['0xabc'], NOW);

    expect(result.volume1h).toBe(250); // 50 + 200
    expect(result.volumeFiltered1h).toBe(200); // only the 0.5 price trade
    expect(result.volume4h).toBe(350); // 50 + 100 + 200
    expect(result.volumeFiltered4h).toBe(200); // only the 0.5 price trade
  });
});
