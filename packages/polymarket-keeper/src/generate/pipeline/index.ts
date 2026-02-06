/**
 * Pipeline/Filter Pattern - Central Registry
 *
 * ========================================
 * THIS IS THE SINGLE SOURCE OF TRUTH
 * FOR ALL FILTER ORDER AND CONFIGURATION
 * ========================================
 *
 * To add, remove, or reorder filters, modify the arrays below.
 * Each pipeline stage is clearly documented with its purpose.
 */

import type { PolymarketMarket, SapienceCondition, SapienceConditionGroup } from '../../types';
import type { Filter, FilterStats, PipelineResult } from './types';

// Import combinators
import { UnionFilter, IntersectionFilter } from './combinators';

// Import all filters
import { BinaryMarketsFilter } from './filters/binary-markets';
import { VolumeThresholdFilter, MarketVolumeThresholdFilter, type MarketGroup } from './filters/volume-threshold';
import { LiquidityThresholdFilter, MarketLiquidityThresholdFilter } from './filters/liquidity-threshold';
import { AlwaysIncludeGroupFilter, AlwaysIncludeMarketFilter, AlwaysIncludeConditionFilter, AlwaysIncludeConditionGroupFilter } from './filters/always-include';
import { NonCryptoConditionFilter, NonCryptoGroupFilter } from './filters/exclude-crypto';
import { ExcludeExistingMarketsFilter, checkExistingConditions } from './filters/exclude-existing';

// Re-export types and utilities
export type { Filter, FilterResult, FilterStats, PipelineResult } from './types';
export type { MarketGroup } from './filters/volume-threshold';
export { checkExistingConditions } from './filters/exclude-existing';
export { matchesAlwaysIncludePatterns } from './filters/always-include';

/**
 * ========================================
 * PIPELINE 1: RAW MARKET FILTERS
 * ========================================
 * Applied to markets fetched from Polymarket API
 * Input: PolymarketMarket[]
 */
export const MARKET_FILTERS: Filter<PolymarketMarket>[] = [
  new BinaryMarketsFilter(),
];

/**
 * ========================================
 * PIPELINE 2: GROUP FILTERS
 * ========================================
 * Applied to market groups (after grouping by event)
 * Input: MarketGroup[] (groups with their markets)
 */
export const GROUP_FILTERS: Filter<MarketGroup>[] = [
  new UnionFilter([
    new IntersectionFilter([
      new VolumeThresholdFilter(),
      new LiquidityThresholdFilter(),
    ]),
    new AlwaysIncludeGroupFilter(),
  ]),
];

/**
 * ========================================
 * PIPELINE 3: UNGROUPED MARKET FILTERS
 * ========================================
 * Applied to markets that don't belong to any group
 * Input: PolymarketMarket[]
 */
export const UNGROUPED_MARKET_FILTERS: Filter<PolymarketMarket>[] = [
  new UnionFilter([
    new IntersectionFilter([
      new MarketVolumeThresholdFilter(),
      new MarketLiquidityThresholdFilter(),
    ]),
    new AlwaysIncludeMarketFilter(),
  ]),
];

/**
 * ========================================
 * PIPELINE 4: SINGLE-MARKET GROUP FILTERS
 * ========================================
 * Previously used to demote single-market groups to ungrouped.
 * Now empty - single-market groups are valid and link to event groups.
 * Input: MarketGroup[]
 */
export const SINGLE_MARKET_FILTERS: Filter<MarketGroup>[] = [];

/**
 * ========================================
 * PIPELINE 5: API SUBMISSION FILTERS (GROUPS)
 * ========================================
 * Applied to groups before API submission
 * Input: SapienceConditionGroup[]
 */
export const API_GROUP_FILTERS: Filter<SapienceConditionGroup>[] = [
  new UnionFilter([
    new NonCryptoGroupFilter(),
    new AlwaysIncludeConditionGroupFilter(),
  ]),
];

/**
 * ========================================
 * PIPELINE 6: API SUBMISSION FILTERS (CONDITIONS)
 * ========================================
 * Applied to conditions before API submission
 * Input: SapienceCondition[]
 */
export const API_CONDITION_FILTERS: Filter<SapienceCondition>[] = [
  new UnionFilter([
    new NonCryptoConditionFilter(),
    new AlwaysIncludeConditionFilter(),
  ]),
];

/**
 * ========================================
 * PIPELINE 7: LLM PRE-FILTER (MARKETS)
 * ========================================
 * Applied before LLM enrichment to skip existing markets
 * Input: PolymarketMarket[]
 * Note: Filter must be constructed with existing IDs (fetched async)
 */
export function createLlmPreFilter(existingIds: Set<string>): Filter<PolymarketMarket>[] {
  return [new ExcludeExistingMarketsFilter(existingIds)];
}

/**
 * Run items through a filter pipeline
 */
export function runPipeline<T>(
  items: T[],
  filters: Filter<T>[],
  options: { verbose?: boolean; label?: string } = {}
): PipelineResult<T> {
  const stats: FilterStats[] = [];
  let current = items;
  let allRemoved: T[] = [];

  for (const filter of filters) {
    const result = filter.apply(current);

    stats.push({
      name: filter.name,
      description: filter.description,
      inputCount: current.length,
      keptCount: result.kept.length,
      removedCount: result.removed.length,
    });

    if (options.verbose) {
      const label = options.label ? `[${options.label}] ` : '';
      console.log(`${label}[${filter.name}] ${result.kept.length}/${current.length} kept (${result.removed.length} removed)`);
    }

    allRemoved.push(...result.removed);
    current = result.kept;
  }

  return { output: current, removed: allRemoved, stats };
}

/**
 * Print a summary of pipeline stats
 */
export function printPipelineStats(stats: FilterStats[], label?: string): void {
  if (stats.length === 0) return;

  const prefix = label ? `[${label}] ` : '';
  for (const s of stats) {
    console.log(`${prefix}[${s.name}] Kept ${s.keptCount}/${s.inputCount} (filtered ${s.removedCount}) - ${s.description}`);
  }
}

/**
 * Get a summary of all registered filters for documentation/debugging
 */
export function getFilterRegistry(): {
  pipeline: string;
  filters: { name: string; description: string }[];
}[] {
  return [
    {
      pipeline: 'MARKET_FILTERS',
      filters: MARKET_FILTERS.map(f => ({ name: f.name, description: f.description })),
    },
    {
      pipeline: 'GROUP_FILTERS',
      filters: GROUP_FILTERS.map(f => ({ name: f.name, description: f.description })),
    },
    {
      pipeline: 'UNGROUPED_MARKET_FILTERS',
      filters: UNGROUPED_MARKET_FILTERS.map(f => ({ name: f.name, description: f.description })),
    },
    {
      pipeline: 'SINGLE_MARKET_FILTERS',
      filters: SINGLE_MARKET_FILTERS.map(f => ({ name: f.name, description: f.description })),
    },
    {
      pipeline: 'API_GROUP_FILTERS',
      filters: API_GROUP_FILTERS.map(f => ({ name: f.name, description: f.description })),
    },
    {
      pipeline: 'API_CONDITION_FILTERS',
      filters: API_CONDITION_FILTERS.map(f => ({ name: f.name, description: f.description })),
    },
  ];
}
