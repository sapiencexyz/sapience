import { describe, expect, it } from 'vitest';
import { filterRows, type TopLevelRow } from '../market-helpers';
import type { FilterState } from '../TableFilters';

const NO_FILTER_RANGES: Pick<
  FilterState,
  | 'openInterestRange'
  | 'similarMarketVolumeRange'
  | 'volume1hRange'
  | 'volume4hRange'
  | 'volume24hRange'
  | 'volume7dRange'
  | 'timeToResolutionRange'
> = {
  openInterestRange: [0, Infinity],
  similarMarketVolumeRange: [0, Infinity],
  volume1hRange: [0, Infinity],
  volume4hRange: [0, Infinity],
  volume24hRange: [0, Infinity],
  volume7dRange: [0, Infinity],
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
      volume1h: 0,
      volume4h: 0,
      volume24h: 0,
      volume7d: 0,
      volumeFiltered1h: 0,
      volumeFiltered4h: 0,
      volumeFiltered24h: 0,
      volumeFiltered7d: 0,
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
    makeConditionRow('low-7d', { volume7d: 500 }),
    makeConditionRow('mid-7d', { volume7d: 50_000 }),
    makeConditionRow('high-7d', { volume7d: 2_000_000 }),
  ];

  it('passes all rows through when every window range is [0, Infinity]', () => {
    expect(filterRows(rows, baseFilters)).toHaveLength(3);
  });

  it('filters by a 7d minimum', () => {
    const result = filterRows(rows, {
      ...baseFilters,
      volume7dRange: [10_000, Infinity],
    });
    expect(result.map((r) => r.id)).toEqual(['mid-7d', 'high-7d']);
  });

  it('filters by a 7d maximum', () => {
    const result = filterRows(rows, {
      ...baseFilters,
      volume7dRange: [0, 100_000],
    });
    expect(result.map((r) => r.id)).toEqual(['low-7d', 'mid-7d']);
  });

  it('applies each window range independently', () => {
    const input: TopLevelRow[] = [
      // Passes 24h floor, fails 1h floor
      makeConditionRow('row-a', { volume24h: 100_000, volume1h: 10 }),
      // Passes both floors
      makeConditionRow('row-b', { volume24h: 100_000, volume1h: 5_000 }),
    ];
    const result = filterRows(input, {
      ...baseFilters,
      volume24hRange: [50_000, Infinity],
      volume1hRange: [1_000, Infinity],
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
      filterRows([sparseRow], { ...baseFilters, volume24hRange: [1, Infinity] })
    ).toHaveLength(0);
  });
});
