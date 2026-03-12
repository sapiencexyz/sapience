// ============================================================================
// Polymarket Strategy — prices markets settled by the ConditionalTokensResolver
//
// THIS IS A STARTING POINT, NOT A PRODUCTION-READY STRATEGY.
// It naively uses the Gamma API mid-price as fair value with no additional
// modeling. Before deploying with real capital you should consider adding:
// CLOB order-book depth analysis for tighter spreads, liquidity-weighted
// fair value estimation, position and inventory tracking, per-market
// exposure limits, and staleness detection for the upstream price feed.
//
// How it works:
//   1. Extracts the Polymarket slug from the condition's similarMarkets field
//      (format: "https://polymarket.com#slug")
//   2. Queries Polymarket's Gamma API by slug to get current YES/NO token prices
//   3. Returns the YES price (outcome index 0) as the fair probability
//
// Customization points:
//   - GAMMA_API_BY_SLUG  — switch to the CLOB API for tighter spreads
//   - getYesProbability()— add your own edge model, vol surface, or skew adjustment
//   - cacheTTL           — tune how long prices are cached (default 10s)
// ============================================================================

import type { Strategy, ConditionById } from './types.js';

const GAMMA_API_BY_SLUG = 'https://gamma-api.polymarket.com/markets/slug/';

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
   * Fetch the YES price from Polymarket's Gamma API using the slug from
   * the condition's similarMarkets field (e.g. "https://polymarket.com#slug").
   */
  async getYesProbability(
    conditionId: string,
    meta: ConditionById | null,
  ): Promise<number | null> {
    if (!meta) return null; // Polymarket needs condition metadata for the slug

    const cached = this.priceCache.get(conditionId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.yesPrice;
    }

    const slug = this.extractPolymarketSlug(meta);
    if (!slug) {
      console.warn(`[Polymarket] No slug for ${conditionId.slice(0, 10)}, similarMarkets:`, meta.similarMarkets);
      return null;
    }

    try {
      const resp = await fetch(`${GAMMA_API_BY_SLUG}${encodeURIComponent(slug)}`);
      if (!resp.ok) return null;

      const market = (await resp.json()) as {
        outcomePrices?: string | number[];
      };
      if (!market) return null;

      let rawPrices: unknown[] = [];
      if (typeof market.outcomePrices === 'string') {
        try { rawPrices = JSON.parse(market.outcomePrices) as unknown[]; } catch { /* */ }
      } else if (Array.isArray(market.outcomePrices)) {
        rawPrices = market.outcomePrices;
      }

      const prices = rawPrices.map(Number);
      if (prices.length === 0) return null;

      // Index 0 is always YES
      let yesPrice = prices[0];
      if (!Number.isFinite(yesPrice)) return null;

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

  /** Extract slug from similarMarkets: "https://polymarket.com#some-slug" */
  private extractPolymarketSlug(meta: ConditionById): string | null {
    const urls = meta.similarMarkets ?? [];
    for (const url of urls) {
      if (url.includes('polymarket.com')) {
        const hash = url.split('#')[1];
        if (hash) return decodeURIComponent(hash);
      }
    }
    return null;
  }
}
