// ============================================================================
// Polymarket Strategy — prices markets settled by the ConditionalTokensResolver
//
// How it works:
//   1. Takes the conditionId from the pick (which is the Gnosis CT conditionId)
//   2. Queries Polymarket's Gamma API to get the current YES/NO token prices
//   3. Returns the YES price as the fair probability
//
// Customization points:
//   - GAMMA_API          — switch to the CLOB API for tighter spreads
//   - getYesProbability()— add your own edge model, vol surface, or skew adjustment
//   - cacheTTL           — tune how long prices are cached (default 10s)
// ============================================================================

import type { Strategy, ConditionById } from './types.js';

const GAMMA_API = 'https://gamma-api.polymarket.com/markets';

export class PolymarketStrategy implements Strategy {
  readonly name = 'Polymarket';
  private resolverAddresses: Set<string>;
  private priceCache = new Map<
    string,
    { yesPrice: number; timestamp: number }
  >();
  private cacheTTL = 10_000; // 10 seconds

  constructor(opts: { resolverAddresses: string[] }) {
    this.resolverAddresses = new Set(
      opts.resolverAddresses.map((a) => a.toLowerCase()),
    );
  }

  matchesResolver(addr: string): boolean {
    return this.resolverAddresses.has(addr.toLowerCase());
  }

  /**
   * Fetch the YES price from Polymarket's Gamma API and return it as fair
   * probability. The condition_id in Sapience is the Gnosis CT conditionId,
   * which matches Polymarket's condition_id.
   */
  async getYesProbability(
    conditionId: string,
    _meta: ConditionById,
  ): Promise<number | null> {
    const cached = this.priceCache.get(conditionId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.yesPrice;
    }

    try {
      const resp = await fetch(
        `${GAMMA_API}?condition_id=${conditionId}`,
      );
      if (!resp.ok) return null;

      const markets = (await resp.json()) as {
        outcomePrices?: string | number[];
      }[];
      if (!markets || markets.length === 0) return null;

      const market = markets[0];

      let yesPrice: number;
      if (typeof market.outcomePrices === 'string') {
        const prices = JSON.parse(market.outcomePrices) as number[];
        yesPrice = prices[0];
      } else if (Array.isArray(market.outcomePrices)) {
        yesPrice = Number(market.outcomePrices[0]);
      } else {
        return null;
      }

      // Clamp to [0.01, 0.99] to avoid extreme values
      yesPrice = Math.max(0.01, Math.min(0.99, yesPrice));

      this.priceCache.set(conditionId, {
        yesPrice,
        timestamp: Date.now(),
      });
      return yesPrice;
    } catch {
      return null;
    }
  }
}
