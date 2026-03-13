/**
 * Filter: Keep only markets with exactly 2 outcomes (binary markets)
 */

import type { PolymarketMarket } from '../../../types';
import type { Filter, FilterResult } from '../types';
import { parseOutcomes } from '../../transform';

export class BinaryMarketsFilter implements Filter<PolymarketMarket> {
  name = 'binary-markets';
  description = 'Keep only markets with exactly 2 outcomes';

  apply(markets: PolymarketMarket[]): FilterResult<PolymarketMarket> {
    const kept: PolymarketMarket[] = [];
    const removed: PolymarketMarket[] = [];

    for (const market of markets) {
      if (parseOutcomes(market.outcomes).length === 2) {
        kept.push(market);
      } else {
        removed.push(market);
      }
    }

    return { kept, removed };
  }
}
