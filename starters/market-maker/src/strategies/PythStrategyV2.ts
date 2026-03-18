// ============================================================================
// Pyth Strategy V2 — Adaptive volatility + mean-reversion pricing
//
// Upgrades over V1:
//   1. EWMA realized vol — replaces static 80% assumption with trailing
//      realized vol computed from Pyth price history
//   2. Term-structure adjustment — inflates vol for short-dated markets
//      (microstructure noise dominates at <1hr)
//   3. Vol regime detection — scales vol based on recent vs historical
//      activity ratio (auto-adapts to breakouts and calm periods)
//   4. Mean-reversion shade — uses Ornstein-Uhlenbeck intuition to adjust
//      P(over) when spot deviates from rolling VWAP (improves short-dated)
//   5. Near-strike dampening — smooths probability near the strike to avoid
//      jumpy quotes where tiny price moves flip fair value
//
// All improvements are non-directional and use only Pyth price data.
// No inventory management, no position tracking, no external feeds.
//
// Configuration (env vars):
//   VOL_LOOKBACK_MS    — EWMA window in ms (default: 3600000 = 1hr)
//   VOL_FAST_MS        — Fast EWMA for regime detection (default: 300000 = 5min)
//   MEAN_REV_STRENGTH  — How much to shade for mean reversion, 0-1 (default: 0.15)
//   STRIKE_DAMPEN_PCT  — % from strike where dampening kicks in (default: 0.5)
//   MIN_VOL            — Floor on annualized vol (default: 0.20)
//   MAX_VOL            — Ceiling on annualized vol (default: 3.00)
// ============================================================================

import {
  decodePythMarketId,
  decodePythLazerFeedId,
} from '@sapience/sdk/auction/encoding';
import { PYTH_FEED_HERMES_MAP } from '@sapience/sdk/constants';
import type { Hex } from 'viem';
import type { Strategy, ConditionById } from './types.js';

// ---------------------------------------------------------------------------
// Price observation for vol estimation
// ---------------------------------------------------------------------------
interface PriceObs {
  price: number;
  timestamp: number; // ms
}

// ---------------------------------------------------------------------------
// Strategy
// ---------------------------------------------------------------------------
export class PythStrategyV2 implements Strategy {
  readonly name = 'PythV2';
  private resolverAddresses: Set<string>;
  private feedMap: Record<number, string>;

  // Price caches
  private priceCache = new Map<number, { price: number; timestamp: number }>();
  private cacheTTL = 5_000;

  // Per-feed price history for vol estimation
  private priceHistory = new Map<number, PriceObs[]>();

  // Config
  private volLookbackMs: number;
  private volFastMs: number;
  private meanRevStrength: number;
  private strikeDampenPct: number;
  private minVol: number;
  private maxVol: number;
  private fallbackVol: number;

  constructor(opts: {
    resolverAddresses: string[];
    volatility?: number; // fallback if not enough history
    feedMapOverride?: string;
    volLookbackMs?: number;
    volFastMs?: number;
    meanRevStrength?: number;
    strikeDampenPct?: number;
    minVol?: number;
    maxVol?: number;
  }) {
    this.resolverAddresses = new Set(
      opts.resolverAddresses.map((a) => a.toLowerCase()),
    );
    this.feedMap = { ...PYTH_FEED_HERMES_MAP };
    this.fallbackVol = opts.volatility ?? 0.8;

    // Config with defaults
    this.volLookbackMs = opts.volLookbackMs ?? 3_600_000; // 1hr
    this.volFastMs = opts.volFastMs ?? 300_000; // 5min
    this.meanRevStrength = opts.meanRevStrength ?? 0.15;
    this.strikeDampenPct = opts.strikeDampenPct ?? 0.005; // 0.5%
    this.minVol = opts.minVol ?? 0.20;
    this.maxVol = opts.maxVol ?? 3.0;

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
    const market = decodePythMarketId(conditionId as Hex);
    if (!market) {
      console.warn(
        `[PythV2] Failed to decode conditionId ${conditionId.slice(0, 18)}...`,
      );
      return null;
    }

    const feedId = decodePythLazerFeedId(market.priceId);
    if (feedId === null) {
      console.warn(
        `[PythV2] Unknown feed priceId ${market.priceId.slice(0, 18)}...`,
      );
      return null;
    }

    const now = Date.now() / 1000;
    const timeToExpiry = Number(market.endTime) - now;
    if (timeToExpiry <= 0) {
      console.warn(
        `[PythV2] Market expired (endTime=${market.endTime}, now=${Math.floor(now)})`,
      );
      return null;
    }

    const currentPrice = await this.fetchPrice(feedId);
    if (currentPrice === null) {
      console.warn(`[PythV2] Failed to fetch price for feed ${feedId}`);
      return null;
    }

    // Record observation for vol estimation
    this.recordObservation(feedId, currentPrice);

    const strike =
      Number(market.strikePrice) * Math.pow(10, market.strikeExpo);
    const T = timeToExpiry / (365.25 * 24 * 3600); // years

    // ---- Adaptive volatility ----
    const vol = this.estimateVol(feedId, T);

    // ---- Base probability (Black-Scholes digital) ----
    let prob = computeOverProbability(currentPrice, strike, T, vol);

    // ---- Mean-reversion adjustment ----
    prob = this.applyMeanReversionShade(feedId, currentPrice, strike, prob, T);

    // ---- Near-strike dampening ----
    prob = this.dampenNearStrike(currentPrice, strike, prob);

    // Clamp to [0.01, 0.99] — never quote certainty
    prob = Math.max(0.01, Math.min(0.99, prob));

    const volPct = (vol * 100).toFixed(0);
    const mins = (T * 365.25 * 24 * 60).toFixed(1);
    console.log(
      `[PythV2] feed=${feedId} spot=${currentPrice.toFixed(2)} strike=${strike} T=${mins}min vol=${volPct}% P(over)=${(prob * 100).toFixed(1)}%`,
    );
    return prob;
  }

  // =========================================================================
  // Volatility estimation
  // =========================================================================

  private recordObservation(feedId: number, price: number): void {
    const history = this.priceHistory.get(feedId) ?? [];
    history.push({ price, timestamp: Date.now() });

    // Trim to 2x lookback window
    const cutoff = Date.now() - this.volLookbackMs * 2;
    const trimmed = history.filter((o) => o.timestamp > cutoff);
    this.priceHistory.set(feedId, trimmed);
  }

  /**
   * Estimate annualized vol using EWMA of log returns + term structure +
   * regime detection.
   */
  private estimateVol(feedId: number, T: number): number {
    const history = this.priceHistory.get(feedId) ?? [];

    // Need at least 10 observations for meaningful vol
    if (history.length < 10) {
      return this.applyTermStructure(this.fallbackVol, T);
    }

    // Compute EWMA realized vol over full lookback
    const slowVol = this.ewmaVol(history, this.volLookbackMs);

    // Compute fast vol for regime detection
    const fastVol = this.ewmaVol(history, this.volFastMs);

    // Base vol: use slow EWMA
    let vol = slowVol ?? this.fallbackVol;

    // Regime adjustment: if fast/slow > 1.5, we're in high-vol regime
    if (slowVol && fastVol && slowVol > 0) {
      const regime = fastVol / slowVol;
      if (regime > 1.5) {
        // High vol regime — scale up
        vol *= Math.min(regime, 2.5);
      } else if (regime < 0.5) {
        // Low vol regime — scale down (but not below floor)
        vol *= Math.max(regime, 0.4);
      }
    }

    // Apply term structure adjustment
    vol = this.applyTermStructure(vol, T);

    // Clamp
    return Math.max(this.minVol, Math.min(this.maxVol, vol));
  }

  /**
   * EWMA realized vol from price observations within a window.
   * Uses exponential weighting with λ = 0.94 (RiskMetrics standard).
   */
  private ewmaVol(
    history: PriceObs[],
    windowMs: number,
  ): number | null {
    const cutoff = Date.now() - windowMs;
    const recent = history.filter((o) => o.timestamp > cutoff);
    if (recent.length < 5) return null;

    // Sort by time
    recent.sort((a, b) => a.timestamp - b.timestamp);

    // Compute log returns
    const returns: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const r = Math.log(recent[i].price / recent[i - 1].price);
      returns.push(r);
    }

    if (returns.length < 3) return null;

    // EWMA variance with λ = 0.94
    const lambda = 0.94;
    let variance = returns[0] * returns[0]; // seed
    for (let i = 1; i < returns.length; i++) {
      variance = lambda * variance + (1 - lambda) * returns[i] * returns[i];
    }

    // Annualize: estimate avg interval, scale to yearly
    const totalTimeMs =
      recent[recent.length - 1].timestamp - recent[0].timestamp;
    const avgIntervalMs = totalTimeMs / (recent.length - 1);
    const intervalsPerYear = (365.25 * 24 * 3600 * 1000) / avgIntervalMs;

    return Math.sqrt(variance * intervalsPerYear);
  }

  /**
   * Term structure: short-dated options need higher vol because
   * microstructure noise (spreads, ticks, latency) dominates.
   *
   * vol_adjusted = vol × (1 + k / √T_hours)
   * where k = 0.1 — adds ~10% vol at 1hr, ~32% at 5min, ~3% at 1day
   */
  private applyTermStructure(vol: number, T: number): number {
    const hoursToExpiry = T * 365.25 * 24;
    if (hoursToExpiry <= 0) return vol;

    const k = 0.1;
    const adjustment = 1 + k / Math.sqrt(Math.max(hoursToExpiry, 0.01));
    return vol * adjustment;
  }

  // =========================================================================
  // Mean-reversion shade
  // =========================================================================

  /**
   * If spot has deviated from its rolling mean, shade probability toward
   * reversion. This improves pricing for short-dated markets where prices
   * tend to mean-revert intraday.
   *
   * Uses a simple rolling mean of recent prices as the "fair" level.
   * If spot > mean, P(over) is shaded down; if spot < mean, shaded up.
   * Effect scales with meanRevStrength and inversely with sqrt(T).
   */
  private applyMeanReversionShade(
    feedId: number,
    spot: number,
    strike: number,
    prob: number,
    T: number,
  ): number {
    const history = this.priceHistory.get(feedId) ?? [];
    if (history.length < 10) return prob;

    // Rolling mean of recent prices
    const recentPrices = history.slice(-50).map((o) => o.price);
    const mean =
      recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;

    if (mean <= 0 || spot <= 0) return prob;

    // Deviation as fraction
    const deviation = (spot - mean) / mean;

    // Mean-reversion effect decays with sqrt(T) — strong for short-dated,
    // negligible for long-dated
    const hoursToExpiry = T * 365.25 * 24;
    const timeDecay = 1 / Math.sqrt(Math.max(hoursToExpiry, 0.1));

    // Shade: if spot is above mean, shade P(over) down
    const shade = -deviation * this.meanRevStrength * timeDecay;

    // Apply shade — additive adjustment, clamped
    return Math.max(0.01, Math.min(0.99, prob + shade));
  }

  // =========================================================================
  // Near-strike dampening
  // =========================================================================

  /**
   * When spot ≈ strike, tiny price moves cause huge swings in BS digital
   * pricing (the "digital risk" or pin risk). We smooth the probability
   * near the strike using a logistic function instead of the sharp BS step.
   *
   * This makes quotes more stable and reduces adverse selection when the
   * market is right at the strike.
   */
  private dampenNearStrike(
    spot: number,
    strike: number,
    prob: number,
  ): number {
    if (strike <= 0 || spot <= 0) return prob;

    const distance = Math.abs(spot - strike) / strike;

    // Only dampen when within strikeDampenPct of strike
    if (distance > this.strikeDampenPct * 3) return prob;

    // Blend toward 0.50 as we approach the strike
    // blendFactor = 1.0 far away (use BS), 0.0 at strike (use 0.50)
    const blendFactor = Math.min(
      1.0,
      distance / (this.strikeDampenPct * 2),
    );

    return prob * blendFactor + 0.5 * (1 - blendFactor);
  }

  // =========================================================================
  // Price fetching (unchanged from V1)
  // =========================================================================

  private async fetchPrice(feedId: number): Promise<number | null> {
    const cached = this.priceCache.get(feedId);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.price;
    }

    const hermesId = this.feedMap[feedId];
    if (!hermesId) {
      console.warn(`[PythV2] No Hermes mapping for feed ${feedId}`);
      return null;
    }

    try {
      const resp = await fetch(
        `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${hermesId}`,
      );
      if (!resp.ok) {
        console.warn(`[PythV2] Hermes HTTP ${resp.status} for feed ${feedId}`);
        return null;
      }

      const data = (await resp.json()) as {
        parsed?: { price: { price: string; expo: number } }[];
      };
      const entry = data?.parsed?.[0];
      if (!entry) {
        console.warn(
          `[PythV2] Hermes returned no parsed data for feed ${feedId}`,
        );
        return null;
      }

      const price =
        Number(entry.price.price) * Math.pow(10, entry.price.expo);
      this.priceCache.set(feedId, { price, timestamp: Date.now() });
      return price;
    } catch (e) {
      console.warn(`[PythV2] Hermes fetch error for feed ${feedId}:`, e);
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
  const d2 =
    (Math.log(spot / strike) - (vol * vol * T) / 2) / (vol * sqrtT);
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
