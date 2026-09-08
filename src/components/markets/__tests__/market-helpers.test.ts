import { describe, expect, it } from 'vitest';
import {
  collapsePriceCategories,
  filterRows,
  type TopLevelRow,
} from '../market-helpers';
import type { FilterState } from '../TableFilters';

const NO_FILTER_RANGES: Pick<
  FilterState,
  | 'openInterestRange'
  | 'similarMarketVolumeRange'
  | 'similarMarketVolume1hRange'
  | 'similarMarketVolume4hRange'
  | 'similarMarketVolume24hRange'
  | 'similarMarketVolume7dRange'
  | 'timeToResolutionRange'
> = {
  openInterestRange: [0, Infinity],
  similarMarketVolumeRange: [0, Infinity],
  similarMarketVolume1hRange: [0, Infinity],
  similarMarketVolume4hRange: [0, Infinity],
  similarMarketVolume24hRange: [0, Infinity],
  similarMarketVolume7dRange: [0, Infinity],
  timeToResolutionRange: [-Infinity, Infinity],
};

function makeConditionRow(
  id: string,
  overrides: Partial<Record<string, unknown>>
): TopLevelRow {
  return {
    kind: 'condition',
    id,
    // Cast — filterRows only reads the fields we populate
    condition: {
      id,
      openInterest: '0',
      endTime: Math.floor(Date.now() / 1000) + 86400,
      similarMarketVolume: 0,
      similarMarketVolume1h: 0,
      similarMarketVolume4h: 0,
      similarMarketVolume24h: 0,
      similarMarketVolume7d: 0,
      ...overrides,
    } as unknown as TopLevelRow extends { condition: infer C } ? C : never,
  };
}

describe('filterRows — time-bucketed volume windows', () => {
  const baseFilters: FilterState = {
    ...NO_FILTER_RANGES,
    selectedCategories: [],
    resolutionStatus: 'unresolved',
    estimatedPriceRange: [0, 100],
  };

  const rows: TopLevelRow[] = [
    makeConditionRow('low-7d', { similarMarketVolume7d: 500 }),
    makeConditionRow('mid-7d', { similarMarketVolume7d: 50_000 }),
    makeConditionRow('high-7d', { similarMarketVolume7d: 2_000_000 }),
  ];

  it('passes all rows through when every window range is [0, Infinity]', () => {
    expect(filterRows(rows, baseFilters)).toHaveLength(3);
  });

  it('filters by a 7d minimum', () => {
    const result = filterRows(rows, {
      ...baseFilters,
      similarMarketVolume7dRange: [10_000, Infinity],
    });
    expect(result.map((r) => r.id)).toEqual(['mid-7d', 'high-7d']);
  });

  it('filters by a 7d maximum', () => {
    const result = filterRows(rows, {
      ...baseFilters,
      similarMarketVolume7dRange: [0, 100_000],
    });
    expect(result.map((r) => r.id)).toEqual(['low-7d', 'mid-7d']);
  });

  it('applies each window range independently', () => {
    const input: TopLevelRow[] = [
      // Passes 24h floor, fails 1h floor
      makeConditionRow('row-a', {
        similarMarketVolume24h: 100_000,
        similarMarketVolume1h: 10,
      }),
      // Passes both floors
      makeConditionRow('row-b', {
        similarMarketVolume24h: 100_000,
        similarMarketVolume1h: 5_000,
      }),
    ];
    const result = filterRows(input, {
      ...baseFilters,
      similarMarketVolume24hRange: [50_000, Infinity],
      similarMarketVolume1hRange: [1_000, Infinity],
    });
    expect(result.map((r) => r.id)).toEqual(['row-b']);
  });

  it('gracefully accepts rows missing volume fields (treated as 0)', () => {
    // A row with no volume fields should be included by default ranges and
    // filtered out by any non-zero minimum.
    const sparseRow = {
      kind: 'condition' as const,
      id: 'sparse',
      condition: {
        id: 'sparse',
        openInterest: '0',
        endTime: Math.floor(Date.now() / 1000) + 86400,
      } as unknown as TopLevelRow extends { condition: infer C } ? C : never,
    };
    expect(filterRows([sparseRow], baseFilters)).toHaveLength(1);
    expect(
      filterRows([sparseRow], {
        ...baseFilters,
        similarMarketVolume24hRange: [1, Infinity],
      })
    ).toHaveLength(0);
  });
});

describe('collapsePriceCategories', () => {
  it('returns rows unchanged when no price sub-categories are present', () => {
    const rows = [
      { slug: 'crypto', name: 'Crypto', raw: 100n },
      { slug: 'sports', name: 'Sports', raw: 50n },
    ];
    const result = collapsePriceCategories(rows);
    expect(result).toEqual([
      { slug: 'crypto', name: 'Crypto', raw: 100n, source: rows[0] },
      { slug: 'sports', name: 'Sports', raw: 50n, source: rows[1] },
    ]);
  });

  it('merges all prices-* sub-categories into a single Prices aggregate', () => {
    const rows = [
      { slug: 'crypto', name: 'Crypto', raw: 100n },
      { slug: 'prices-crypto', name: 'Crypto Prices', raw: 30n },
      { slug: 'prices-equity', name: 'Equity Prices', raw: 20n },
      { slug: 'prices-commodities', name: 'Commodities Prices', raw: 10n },
    ];
    const result = collapsePriceCategories(rows);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.slug === 'crypto')?.raw).toBe(100n);
    const merged = result.find((r) => r.slug === 'prices');
    expect(merged).toBeDefined();
    expect(merged?.name).toBe('Prices');
    expect(merged?.raw).toBe(60n);
    expect(merged?.source).toBeUndefined();
  });

  it('merges a single prices-* row into the Prices aggregate', () => {
    const rows = [{ slug: 'prices-crypto', name: 'Crypto Prices', raw: 7n }];
    const result = collapsePriceCategories(rows);
    expect(result).toEqual([{ slug: 'prices', name: 'Prices', raw: 7n }]);
  });

  it('handles an empty input', () => {
    expect(collapsePriceCategories([])).toEqual([]);
  });
});
