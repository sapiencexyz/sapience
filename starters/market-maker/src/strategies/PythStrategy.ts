// ============================================================================
// Pyth Strategy — prices binary option markets settled by the PythConditionResolver
//
// How it works:
//   1. Parses market params (strike, expiry, feed) from the condition description
//   2. Fetches the current spot price from Pyth's Hermes REST API
//   3. Computes P(Over) using a Black-Scholes digital option model
//
// Customization points:
//   - DEFAULT_FEED_MAP  — add new Pyth Lazer feed IDs and their Hermes price IDs
//   - VOLATILITY env    — tune the annualized volatility assumption (default 80%)
//   - fetchPrice()      — swap Hermes for a different price source (e.g. exchange WS)
//   - computeOverProbability() — replace the log-normal model with your own
// ============================================================================

import {
  parsePythMarketFromDescription,
  decodePythLazerFeedId,
} from '@sapience/sdk/auction/encoding';
import type { Strategy, ConditionById } from './types.js';

/**
 * Pyth Lazer feed ID → Pyth Hermes price ID mapping.
 * Override via PYTH_FEED_MAP env: "2:e62d...,3:ff61...,7:ef0d..."
 */
const DEFAULT_FEED_MAP: Record<number, string> = {
  2: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
  3: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH/USD
  4: '925ca92ff005ae943c158e3563f59698ce7e75c5a8c8dd43303a0a154887b3e6', // USOILSPOT/USD
  5: '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2', // XAU/USD
  6: '19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5', // SPY/USD
  7: '16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1', // TSLA/USD
};

export class PythStrategy implements Strategy {
  readonly name = 'Pyth';
  private resolverAddresses: Set<string>;
  private volatility: number;
  private feedMap: Record<number, string>;
  private priceCache = new Map<number, { price: number; timestamp: number }>();
  private cacheTTL = 5_000; // 5 seconds

  constructor(opts: {
    resolverAddresses: string[];
    volatility?: number;
    feedMapOverride?: string; // "2:abc...,3:def..."
  }) {
    this.resolverAddresses = new Set(opts.resolverAddresses.map((a) => a.toLowerCase()));
    this.volatility = opts.volatility ?? 0.8;
    this.feedMap = { ...DEFAULT_FEED_MAP };

    if (opts.feedMapOverride) {
      for (const entry of opts.feedMapOverride.split(',')) {
        const [id, hermesId] = entry.split(':');
        if (id && hermesId) this.feedMap[Number(id)] = hermesId.trim();
      }
    }
  }

  matchesResolver(addr: string): boolean {
    return this.resolverAddresses.has(addr.toLowerCase());
  }

  async getYesProbability(
    _conditionId: string,
    meta: ConditionById,
  ): Promise<number | null> {
    const market = parsePythMarketFromDescription(meta.description ?? '');
    if (!market) return null;

    const feedId = decodePythLazerFeedId(market.priceId);
    if (feedId === null) return null;

    const now = Date.now() / 1000;
    const timeToExpiry = Number(market.endTime) - now;
    if (timeToExpiry <= 0) return null; // Already expired, can't price

    const currentPrice = await this.fetchPrice(feedId);
    if (currentPrice === null) return null;

    const strike = Number(market.strikePrice) * Math.pow(10, market.strikeExpo);
    const T = timeToExpiry / (365.25 * 24 * 3600); // years

    return computeOverProbability(currentPrice, strike, T, this.volatility);
  }

  private async fetchPrice(feedId: number): Promise<number | null> {
    const cached = this.priceCache.get(feedId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }

    const hermesId = this.feedMap[feedId];
    if (!hermesId) return null;

    try {
      const resp = await fetch(
        `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${hermesId}`,
      );
      if (!resp.ok) return null;

      const data = (await resp.json()) as {
        parsed?: { price: { price: string; expo: number } }[];
      };
      const entry = data?.parsed?.[0];
      if (!entry) return null;

      const price =
        Number(entry.price.price) * Math.pow(10, entry.price.expo);
      this.priceCache.set(feedId, { price, timestamp: Date.now() });
      return price;
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Pricing helpers
// ---------------------------------------------------------------------------

/**
 * P(spot > strike at expiry) under log-normal dynamics (Black-Scholes digital).
 *
 *   P(Over) = Φ(d₂)
 *   d₂ = [ln(S/K) − σ²T/2] / (σ√T)
 *
 * Risk-free rate assumed 0 (crypto).
 */
function computeOverProbability(
  spot: number,
  strike: number,
  T: number,
  vol: number,
): number {
  if (T <= 0) return spot >= strike ? 1 : 0;
  if (strike <= 0 || spot <= 0) return 0;

  const sqrtT = Math.sqrt(T);
  const d2 = (Math.log(spot / strike) - (vol * vol * T) / 2) / (vol * sqrtT);
  return normalCDF(d2);
}

/**
 * Standard normal CDF — Abramowitz & Stegun rational approximation.
 * Accurate to ~7 decimal places.
 */
function normalCDF(x: number): number {
  if (x > 6) return 1;
  if (x < -6) return 0;

  const a = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327; // 1/√(2π)
  const p =
    d *
    Math.exp(-0.5 * a * a) *
    (t *
      (0.31938153 +
        t *
          (-0.356563782 +
            t *
              (1.781477937 +
                t * (-1.821255978 + t * 1.330274429)))));

  return x >= 0 ? 1 - p : p;
}
