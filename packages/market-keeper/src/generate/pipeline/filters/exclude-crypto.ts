/**
 * Filter: Exclude crypto category conditions/groups
 */

import type {
  PolymarketMarket,
  SapienceCondition,
  SapienceConditionGroup,
} from '../../../types';
import type { Filter, FilterResult } from '../types';
import { inferSapienceCategorySlug } from '../../category';
import { matchesAlwaysIncludePatterns } from './always-include';

/**
 * Filter out crypto markets at the raw PolymarketMarket stage (pre-LLM).
 * Uses inferSapienceCategorySlug as a heuristic; always-include patterns override.
 */
export class NonCryptoMarketFilter implements Filter<PolymarketMarket> {
  name = 'non-crypto-markets';
  description = 'Skip crypto markets before LLM enrichment (saves API cost)';

  apply(markets: PolymarketMarket[]): FilterResult<PolymarketMarket> {
    const kept: PolymarketMarket[] = [];
    const removed: PolymarketMarket[] = [];

    for (const market of markets) {
      const isCrypto = inferSapienceCategorySlug(market) === 'crypto';
      const isAlwaysInclude = matchesAlwaysIncludePatterns(market.question);
      if (isCrypto && !isAlwaysInclude) {
        removed.push(market);
      } else {
        kept.push(market);
      }
    }

    return { kept, removed };
  }
}

/**
 * Filter out crypto conditions (keeps non-crypto)
 */
export class NonCryptoConditionFilter implements Filter<SapienceCondition> {
  name = 'non-crypto';
  description = 'Keep non-crypto conditions';

  apply(conditions: SapienceCondition[]): FilterResult<SapienceCondition> {
    const kept: SapienceCondition[] = [];
    const removed: SapienceCondition[] = [];

    for (const condition of conditions) {
      if (condition.categorySlug !== 'crypto') {
        kept.push(condition);
      } else {
        removed.push(condition);
      }
    }

    return { kept, removed };
  }
}

/**
 * Filter out crypto groups (keeps non-crypto)
 */
export class NonCryptoGroupFilter implements Filter<SapienceConditionGroup> {
  name = 'non-crypto-groups';
  description = 'Keep non-crypto groups';

  apply(
    groups: SapienceConditionGroup[]
  ): FilterResult<SapienceConditionGroup> {
    const kept: SapienceConditionGroup[] = [];
    const removed: SapienceConditionGroup[] = [];

    for (const group of groups) {
      if (group.categorySlug !== 'crypto') {
        kept.push(group);
      } else {
        removed.push(group);
      }
    }

    return { kept, removed };
  }
}
