/**
 * Filter: Keep groups/markets where at least one market meets liquidity threshold
 */

import type { PolymarketMarket } from '../../../types';
import type { Filter, FilterResult } from '../types';
import { MIN_LIQUIDITY_THRESHOLD } from '../../../constants';
import type { MarketGroup } from './volume-threshold';

export class LiquidityThresholdFilter implements Filter<MarketGroup> {
  name = 'liquidity-threshold';
  description = `Keep groups with at least one market having liquidity >= $${MIN_LIQUIDITY_THRESHOLD.toLocaleString()}`;

  apply(groups: MarketGroup[]): FilterResult<MarketGroup> {
    const kept: MarketGroup[] = [];
    const removed: MarketGroup[] = [];

    for (const group of groups) {
      const hasHighLiquidity = group.markets.some(
        m => parseFloat(m.liquidity || '0') >= MIN_LIQUIDITY_THRESHOLD
      );

      if (hasHighLiquidity) {
        kept.push(group);
      } else {
        removed.push(group);
      }
    }

    return { kept, removed };
  }
}

/**
 * Filter for ungrouped markets (individual markets, not groups)
 */
export class MarketLiquidityThresholdFilter implements Filter<PolymarketMarket> {
  name = 'market-liquidity-threshold';
  description = `Keep markets with liquidity >= $${MIN_LIQUIDITY_THRESHOLD.toLocaleString()}`;

  apply(markets: PolymarketMarket[]): FilterResult<PolymarketMarket> {
    const kept: PolymarketMarket[] = [];
    const removed: PolymarketMarket[] = [];

    for (const market of markets) {
      if (parseFloat(market.liquidity || '0') >= MIN_LIQUIDITY_THRESHOLD) {
        kept.push(market);
      } else {
        removed.push(market);
      }
    }

    return { kept, removed };
  }
}
