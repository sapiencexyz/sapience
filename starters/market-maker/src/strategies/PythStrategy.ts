// ============================================================================
// Pyth Strategy — prices binary option markets settled by the PythConditionResolver
//
// THIS IS A STARTING POINT, NOT A PRODUCTION-READY STRATEGY.
// It uses a single-parameter Black-Scholes model with a static volatility
// assumption and no risk management. Before deploying with real capital you
// should consider adding: a vol surface or realized-vol estimator, position
// and inventory tracking, per-market exposure limits, dynamic edge sizing,
// and correlation-aware pricing for combos.
//
// How it works:
//   1. Decodes market params (strike, expiry, feed) directly from the conditionId
//      (which is raw ABI-encoded, not hashed)
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
  decodePythMarketId,
  decodePythLazerFeedId,
} from '@sapience/sdk/auction/encoding';
import { PYTH_FEED_HERMES_MAP } from '@sapience/sdk/constants';
import type { Hex } from 'viem';
import type { Strategy, ConditionById } from './types.js';

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
    this.feedMap = { ...PYTH_FEED_HERMES_MAP };

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
    conditionId: string,
    _meta: ConditionById,
  ): Promise<number | null> {
    // conditionId is raw ABI-encoded market params (not hashed)
    const market = decodePythMarketId(conditionId as Hex);
    if (!market) {
      console.warn(`[Pyth] Failed to decode conditionId ${conditionId.slice(0, 18)}...`);
      return null;
    }

    const feedId = decodePythLazerFeedId(market.priceId);
    if (feedId === null) {
      console.warn(`[Pyth] Unknown feed priceId ${market.priceId.slice(0, 18)}...`);
      return null;
    }

    const now = Date.now() / 1000;
    const timeToExpiry = Number(market.endTime) - now;
    if (timeToExpiry <= 0) {
      console.warn(`[Pyth] Market expired (endTime=${market.endTime}, now=${Math.floor(now)})`);
      return null;
    }

    const currentPrice = await this.fetchPrice(feedId);
    if (currentPrice === null) {
      console.warn(`[Pyth] Failed to fetch price for feed ${feedId}`);
      return null;
    }

    const strike = Number(market.strikePrice) * Math.pow(10, market.strikeExpo);
    const T = timeToExpiry / (365.25 * 24 * 3600); // years
    const prob = computeOverProbability(currentPrice, strike, T, this.volatility);
    console.log(`[Pyth] feed=${feedId} spot=${currentPrice} strike=${strike} T=${(T * 365.25 * 24 * 60).toFixed(1)}min P(over)=${(prob * 100).toFixed(1)}%`);
    return prob;
  }

  private async fetchPrice(feedId: number): Promise<number | null> {
    const cached = this.priceCache.get(feedId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }

    const hermesId = this.feedMap[feedId];
    if (!hermesId) {
      console.warn(`[Pyth] No Hermes mapping for feed ${feedId}`);
      return null;
    }

    try {
      const resp = await fetch(
        `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${hermesId}`,
      );
      if (!resp.ok) {
        console.warn(`[Pyth] Hermes HTTP ${resp.status} for feed ${feedId}`);
        return null;
      }

      const data = (await resp.json()) as {
        parsed?: { price: { price: string; expo: number } }[];
      };
      const entry = data?.parsed?.[0];
      if (!entry) {
        console.warn(`[Pyth] Hermes returned no parsed data for feed ${feedId}`);
        return null;
      }

      const price =
        Number(entry.price.price) * Math.pow(10, entry.price.expo);
      this.priceCache.set(feedId, { price, timestamp: Date.now() });
      return price;
    } catch (e) {
      console.warn(`[Pyth] Hermes fetch error for feed ${feedId}:`, e);
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
