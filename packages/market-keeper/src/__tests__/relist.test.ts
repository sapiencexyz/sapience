import { describe, it, expect } from 'vitest';
import type { PolymarketMarket } from '../types';

function makeMarket(
  overrides: Partial<PolymarketMarket> = {}
): PolymarketMarket {
  return {
    id: 'test-id',
    question: 'Will X happen?',
    conditionId: '0xabc',
    outcomes: ['Yes', 'No'],
    volume: '50000',
    liquidity: '5000',
    endDate: '2025-12-31T00:00:00Z',
    description: 'Test market',
    slug: 'test-market',
    category: 'politics',
    active: true,
    closed: false,
    ...overrides,
  };
}

describe('relist: filter to new markets only', () => {
  it('filters out markets that already exist in Sapience', () => {
    const markets = [
      makeMarket({ conditionId: '0x1' }),
      makeMarket({ conditionId: '0x2' }),
      makeMarket({ conditionId: '0x3' }),
    ];

    const existingConditions = new Map([
      ['0x1', { endTime: 1700000000 }],
      ['0x3', { endTime: 1700000000 }],
    ]);

    const newMarkets = markets.filter(
      (m) => !existingConditions.has(m.conditionId)
    );

    expect(newMarkets).toHaveLength(1);
    expect(newMarkets[0].conditionId).toBe('0x2');
  });

  it('keeps all markets when none exist in Sapience', () => {
    const markets = [
      makeMarket({ conditionId: '0x1' }),
      makeMarket({ conditionId: '0x2' }),
    ];

    const existingConditions = new Map<string, { endTime: number }>();

    const newMarkets = markets.filter(
      (m) => !existingConditions.has(m.conditionId)
    );

    expect(newMarkets).toHaveLength(2);
  });

  it('returns empty when all markets already exist', () => {
    const markets = [
      makeMarket({ conditionId: '0x1' }),
      makeMarket({ conditionId: '0x2' }),
    ];

    const existingConditions = new Map([
      ['0x1', { endTime: 1700000000 }],
      ['0x2', { endTime: 1700000000 }],
    ]);

    const newMarkets = markets.filter(
      (m) => !existingConditions.has(m.conditionId)
    );

    expect(newMarkets).toHaveLength(0);
  });
});
