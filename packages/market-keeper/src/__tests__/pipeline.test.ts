import { describe, it, expect } from 'vitest';
import type { PolymarketMarket } from '../types';
import { BinaryMarketsFilter } from '../generate/pipeline/filters/binary-markets';
import { MarketLiquidityThresholdFilter } from '../generate/pipeline/filters/liquidity-threshold';
import {
  ExcludeExistingMarketsFilter,
  type ExistingCondition,
} from '../generate/pipeline/filters/exclude-existing';
import { runPipeline } from '../generate/pipeline';
import { UnionFilter } from '../generate/pipeline/combinators';
import type { Filter, FilterResult } from '../generate/pipeline/types';

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

// ============ UnionFilter ============

describe('UnionFilter', () => {
  // A trivial item-local filter: keeps items whose `tag` is in `tags`.
  class TagFilter implements Filter<{ id: string; tag: string }> {
    name: string;
    description = 'tag filter';
    constructor(
      private tags: string[],
      name = 'tag-filter'
    ) {
      this.name = name;
    }
    apply(items: { id: string; tag: string }[]): FilterResult<{
      id: string;
      tag: string;
    }> {
      const kept = items.filter((i) => this.tags.includes(i.tag));
      const removed = items.filter((i) => !this.tags.includes(i.tag));
      return { kept, removed };
    }
  }

  it('keeps items kept by ANY sub-filter (per-item OR semantics, backward compat)', () => {
    const items = [
      { id: '1', tag: 'a' },
      { id: '2', tag: 'b' },
      { id: '3', tag: 'c' },
    ];
    const filter = new UnionFilter<{ id: string; tag: string }>([
      new TagFilter(['a'], 'keeps-a'),
      new TagFilter(['b'], 'keeps-b'),
    ]);

    const { kept, removed } = filter.apply(items);

    expect(kept.map((i) => i.id).sort()).toEqual(['1', '2']);
    expect(removed.map((i) => i.id)).toEqual(['3']);
  });

  it('preserves input order and identity (no duplicates) when sub-filters overlap', () => {
    const items = [
      { id: '1', tag: 'a' },
      { id: '2', tag: 'a' },
    ];
    // Two sub-filters that both keep tag=a → an item could be double-counted
    // if the implementation simply concatenates kept sets.
    const filter = new UnionFilter<{ id: string; tag: string }>([
      new TagFilter(['a'], 'first'),
      new TagFilter(['a'], 'second'),
    ]);

    const { kept } = filter.apply(items);

    expect(kept).toHaveLength(2);
    expect(kept[0]).toBe(items[0]);
    expect(kept[1]).toBe(items[1]);
  });

  it('lets sibling-aware sub-filters use cross-item state', () => {
    // A stateful sub-filter that needs to see ALL items: keeps every item
    // that shares a `groupId` with at least one item whose `volume >= 100`.
    // This relies on UnionFilter passing the full input list, not [item].
    class GroupRescueFilter
      implements Filter<{ id: string; groupId: string; volume: number }>
    {
      name = 'group-rescue';
      description = 'rescue siblings of high-volume members';
      apply(
        items: { id: string; groupId: string; volume: number }[]
      ): FilterResult<{ id: string; groupId: string; volume: number }> {
        const passingGroups = new Set(
          items.filter((i) => i.volume >= 100).map((i) => i.groupId)
        );
        const kept = items.filter((i) => passingGroups.has(i.groupId));
        const removed = items.filter((i) => !passingGroups.has(i.groupId));
        return { kept, removed };
      }
    }
    // A stateless never-keep filter to guarantee the rescue branch is the
    // only thing keeping low-volume items.
    class NeverKeepFilter
      implements Filter<{ id: string; groupId: string; volume: number }>
    {
      name = 'never';
      description = 'never';
      apply(
        items: { id: string; groupId: string; volume: number }[]
      ): FilterResult<{ id: string; groupId: string; volume: number }> {
        return { kept: [], removed: items };
      }
    }

    const items = [
      { id: 'big-A', groupId: 'A', volume: 500 },
      { id: 'small-A', groupId: 'A', volume: 1 }, // rescued via sibling
      { id: 'small-B', groupId: 'B', volume: 1 }, // not rescued, B has nothing big
    ];
    const filter = new UnionFilter([
      new NeverKeepFilter(),
      new GroupRescueFilter(),
    ]);

    const { kept } = filter.apply(items);

    expect(kept.map((i) => i.id).sort()).toEqual(['big-A', 'small-A']);
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
