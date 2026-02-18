/**
 * Filter: Exclude crypto category conditions/groups
 */

import type { SapienceCondition, SapienceConditionGroup } from '../../../types';
import type { Filter, FilterResult } from '../types';

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

  apply(groups: SapienceConditionGroup[]): FilterResult<SapienceConditionGroup> {
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
