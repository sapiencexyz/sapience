/**
 * Filter: Keep groups/markets where at least one market meets volume threshold
 */

import type { PolymarketMarket } from '../../../types';
import type { Filter, FilterResult } from '../types';
import { MIN_VOLUME_THRESHOLD } from '../../../constants';

export type MarketGroup = {
  title: string;
  markets: PolymarketMarket[];
  eventSlug?: string;
};

export class VolumeThresholdFilter implements Filter<MarketGroup> {
  name = 'volume-threshold';
  description = `Keep groups with at least one market having volume >= $${MIN_VOLUME_THRESHOLD.toLocaleString()}`;

  apply(groups: MarketGroup[]): FilterResult<MarketGroup> {
    const kept: MarketGroup[] = [];
    const removed: MarketGroup[] = [];

    for (const group of groups) {
      const hasHighVolume = group.markets.some(
        m => parseFloat(m.volume || '0') >= MIN_VOLUME_THRESHOLD
      );

      if (hasHighVolume) {
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
export class MarketVolumeThresholdFilter implements Filter<PolymarketMarket> {
  name = 'market-volume-threshold';
  description = `Keep markets with volume >= $${MIN_VOLUME_THRESHOLD.toLocaleString()}`;

  apply(markets: PolymarketMarket[]): FilterResult<PolymarketMarket> {
    const kept: PolymarketMarket[] = [];
    const removed: PolymarketMarket[] = [];

    for (const market of markets) {
      if (parseFloat(market.volume || '0') >= MIN_VOLUME_THRESHOLD) {
        kept.push(market);
      } else {
        removed.push(market);
      }
    }

    return { kept, removed };
  }
}
