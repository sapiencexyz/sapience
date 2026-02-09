/**
 * Filter: Re-include markets/groups that match always-include patterns
 * (Fed, S&P 500, Bitcoin/Ethereum daily price markets)
 */

import type { PolymarketMarket, SapienceCondition, SapienceConditionGroup } from '../../../types';
import type { Filter, FilterResult } from '../types';
import { ALWAYS_INCLUDE_PATTERNS } from '../../../constants';
import type { MarketGroup } from './volume-threshold';

/**
 * Check if a question matches always-include patterns
 */
export function matchesAlwaysIncludePatterns(question: string): boolean {
  return ALWAYS_INCLUDE_PATTERNS.some(pattern => pattern.test(question));
}

/**
 * Filter for groups: keep groups where at least one market matches always-include patterns
 * This is an "OR" filter - it re-includes items that were removed by volume threshold
 */
export class AlwaysIncludeGroupFilter implements Filter<MarketGroup> {
  name = 'always-include-groups';
  description = 'Keep groups matching Fed/S&P/BTC/ETH patterns regardless of volume';

  apply(groups: MarketGroup[]): FilterResult<MarketGroup> {
    const kept: MarketGroup[] = [];
    const removed: MarketGroup[] = [];

    for (const group of groups) {
      const hasAlwaysInclude = group.markets.some(
        m => matchesAlwaysIncludePatterns(m.question || '')
      );

      if (hasAlwaysInclude) {
        kept.push(group);
      } else {
        removed.push(group);
      }
    }

    return { kept, removed };
  }
}

/**
 * Filter for individual markets: keep markets matching always-include patterns
 */
export class AlwaysIncludeMarketFilter implements Filter<PolymarketMarket> {
  name = 'always-include-markets';
  description = 'Keep markets matching Fed/S&P/BTC/ETH patterns regardless of volume';

  apply(markets: PolymarketMarket[]): FilterResult<PolymarketMarket> {
    const kept: PolymarketMarket[] = [];
    const removed: PolymarketMarket[] = [];

    for (const market of markets) {
      if (matchesAlwaysIncludePatterns(market.question || '')) {
        kept.push(market);
      } else {
        removed.push(market);
      }
    }

    return { kept, removed };
  }
}

/**
 * Filter for conditions: keep conditions matching always-include patterns
 */
export class AlwaysIncludeConditionFilter implements Filter<SapienceCondition> {
  name = 'always-include-conditions';
  description = 'Keep conditions matching Fed/S&P/BTC/ETH patterns';

  apply(conditions: SapienceCondition[]): FilterResult<SapienceCondition> {
    const kept: SapienceCondition[] = [];
    const removed: SapienceCondition[] = [];

    for (const condition of conditions) {
      if (matchesAlwaysIncludePatterns(condition.question || '')) {
        kept.push(condition);
      } else {
        removed.push(condition);
      }
    }

    return { kept, removed };
  }
}

/**
 * Filter for condition groups: keep groups where at least one condition matches always-include patterns
 */
export class AlwaysIncludeConditionGroupFilter implements Filter<SapienceConditionGroup> {
  name = 'always-include-condition-groups';
  description = 'Keep groups with Fed/S&P/BTC/ETH conditions';

  apply(groups: SapienceConditionGroup[]): FilterResult<SapienceConditionGroup> {
    const kept: SapienceConditionGroup[] = [];
    const removed: SapienceConditionGroup[] = [];

    for (const group of groups) {
      const hasAlwaysInclude = group.conditions.some(
        c => matchesAlwaysIncludePatterns(c.question || '')
      );

      if (hasAlwaysInclude) {
        kept.push(group);
      } else {
        removed.push(group);
      }
    }

    return { kept, removed };
  }
}
