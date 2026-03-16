import { describe, it, expect } from 'vitest';
import type { PolymarketMarket } from '../types';
import { BinaryMarketsFilter } from '../generate/pipeline/filters/binary-markets';
import { MarketLiquidityThresholdFilter } from '../generate/pipeline/filters/liquidity-threshold';
import {
  ExcludeExistingMarketsFilter,
  type ExistingCondition,
} from '../generate/pipeline/filters/exclude-existing';
import { runPipeline } from '../generate/pipeline';

// ============ Test Helpers ============

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

// ============ BinaryMarketsFilter ============

describe('BinaryMarketsFilter', () => {
  const filter = new BinaryMarketsFilter();

  it('keeps markets with exactly 2 outcomes', () => {
    const markets = [makeMarket({ outcomes: ['Yes', 'No'] })];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it('keeps markets with JSON-stringified 2 outcomes', () => {
    const markets = [makeMarket({ outcomes: '["Yes","No"]' })];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });

  it('removes markets with 3+ outcomes', () => {
    const markets = [makeMarket({ outcomes: ['A', 'B', 'C'] })];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it('removes markets with 1 outcome', () => {
    const markets = [makeMarket({ outcomes: ['Yes'] })];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it('removes markets with empty outcomes', () => {
    const markets = [makeMarket({ outcomes: [] })];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });
});

// ============ MarketLiquidityThresholdFilter ============

describe('MarketLiquidityThresholdFilter', () => {
  const filter = new MarketLiquidityThresholdFilter();

  it('keeps markets at or above $1000 liquidity', () => {
    const markets = [makeMarket({ liquidity: '1000' })];
    const { kept } = filter.apply(markets);
    expect(kept).toHaveLength(1);
  });

  it('removes markets below $1000 liquidity', () => {
    const markets = [makeMarket({ liquidity: '999' })];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(0);
    expect(removed).toHaveLength(1);
  });

  it('treats missing liquidity as 0', () => {
    const markets = [makeMarket({ liquidity: '' })];
    const { kept } = filter.apply(markets);
    expect(kept).toHaveLength(0);
  });
});

// ============ ExcludeExistingMarketsFilter ============

describe('ExcludeExistingMarketsFilter', () => {
  it('removes markets that exist in the Set', () => {
    const existing = new Set(['0xabc']);
    const filter = new ExcludeExistingMarketsFilter(existing);
    const markets = [
      makeMarket({ conditionId: '0xabc' }),
      makeMarket({ conditionId: '0xdef' }),
    ];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(1);
    expect(kept[0].conditionId).toBe('0xdef');
    expect(removed).toHaveLength(1);
  });

  it('removes markets that exist in the Map', () => {
    const existing = new Map<string, ExistingCondition>([
      ['0xabc', { endTime: 1000 }],
    ]);
    const filter = new ExcludeExistingMarketsFilter(existing);
    const markets = [
      makeMarket({ conditionId: '0xabc' }),
      makeMarket({ conditionId: '0xdef' }),
    ];
    const { kept, removed } = filter.apply(markets);
    expect(kept).toHaveLength(1);
    expect(kept[0].conditionId).toBe('0xdef');
    expect(removed).toHaveLength(1);
  });

  it('keeps all markets when none exist', () => {
    const filter = new ExcludeExistingMarketsFilter(new Set());
    const markets = [makeMarket({ conditionId: '0xabc' })];
    const { kept } = filter.apply(markets);
    expect(kept).toHaveLength(1);
  });
});

// ============ runPipeline ============

describe('runPipeline', () => {
  it('chains multiple filters in order', () => {
    const markets = [
      makeMarket({ outcomes: ['A', 'B', 'C'], liquidity: '5000' }), // non-binary
      makeMarket({ outcomes: ['Yes', 'No'], liquidity: '500' }), // low liquidity
      makeMarket({ outcomes: ['Yes', 'No'], liquidity: '5000' }), // passes both
    ];

    const { output, stats } = runPipeline(markets, [
      new BinaryMarketsFilter(),
      new MarketLiquidityThresholdFilter(),
    ]);

    expect(output).toHaveLength(1);
    expect(stats).toHaveLength(2);
    expect(stats[0].name).toBe('binary-markets');
    expect(stats[0].keptCount).toBe(2);
    expect(stats[0].removedCount).toBe(1);
    expect(stats[1].name).toBe('market-liquidity-threshold');
    expect(stats[1].keptCount).toBe(1);
    expect(stats[1].removedCount).toBe(1);
  });

  it('returns all items when no filters are provided', () => {
    const markets = [makeMarket()];
    const { output } = runPipeline(markets, []);
    expect(output).toHaveLength(1);
  });
});
