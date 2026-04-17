/**
 * Committed-Intent exposure tracker tests.
 *
 * Exercises:
 *   - add / remove quote updates the per-counterparty exposure
 *   - refuses to accept a quote that would push exposure past
 *     `vaultBalance * leverageFactor`
 *   - refuses to accept a quote that would drop the insurance rate
 *     below `minInsuranceRate`
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getAddress, type Address, type Hex } from 'viem';
import type { Quote } from '@sapience/sdk/types/committedIntent';
import {
  addQuote,
  removeQuote,
  getExposure,
  checkAcceptance,
  _clearExposureForTesting,
} from '../committedIntentExposure';

const CP = getAddress('0x000000000000000000000000000000000000Ca01') as Address;
const COMMITMENT_HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;

function mkQuote(overrides: Partial<Quote>): Quote {
  return {
    counterparty: CP,
    deadline: 1800000100n,
    commitmentHash: COMMITMENT_HASH,
    maxIn: 100n * 10n ** 18n,
    amountOut: 200n * 10n ** 18n,
    nonce: 1n,
    ...overrides,
  };
}

describe('committedIntentExposure', () => {
  beforeEach(() => {
    _clearExposureForTesting();
  });

  describe('add / remove', () => {
    it('addQuote increases exposure by quote.amountOut', () => {
      expect(getExposure(CP)).toBe(0n);
      addQuote(mkQuote({ amountOut: 100n }), 'hash-1');
      expect(getExposure(CP)).toBe(100n);
      addQuote(mkQuote({ amountOut: 300n }), 'hash-2');
      expect(getExposure(CP)).toBe(400n);
    });

    it('removeQuote decreases exposure by the original amount', () => {
      addQuote(mkQuote({ amountOut: 500n }), 'a');
      addQuote(mkQuote({ amountOut: 250n }), 'b');
      expect(getExposure(CP)).toBe(750n);

      const removed = removeQuote('a');
      expect(removed).toBe(500n);
      expect(getExposure(CP)).toBe(250n);
    });

    it('removeQuote for an unknown hash returns 0 and does not underflow', () => {
      addQuote(mkQuote({ amountOut: 100n }), 'a');
      expect(removeQuote('nope')).toBe(0n);
      expect(getExposure(CP)).toBe(100n);
    });

    it('addQuote is idempotent on duplicate hash', () => {
      addQuote(mkQuote({ amountOut: 100n }), 'a');
      addQuote(mkQuote({ amountOut: 100n }), 'a');
      expect(getExposure(CP)).toBe(100n);
    });
  });

  describe('checkAcceptance — leverage rail', () => {
    it('accepts when exposure stays within vaultBalance × leverage', () => {
      // vaultBalance = 100, leverage = 1x → allow up to 100 total.
      const result = checkAcceptance({
        cp: CP,
        vaultBalance: 100n,
        quote: mkQuote({ amountOut: 100n }),
        leverageFactorBps: 10_000,
        minInsuranceRateBps: 1_000,
      });
      expect(result.ok).toBe(true);
      expect(result.totalExposureAfter).toBe(100n);
    });

    it('refuses when totalExposureAfter > vault × leverage', () => {
      // existing exposure already at 100 with 1x leverage and vault=100.
      addQuote(mkQuote({ amountOut: 100n }), 'seed');
      const result = checkAcceptance({
        cp: CP,
        vaultBalance: 100n,
        quote: mkQuote({ amountOut: 1n }),
        leverageFactorBps: 10_000,
        minInsuranceRateBps: 0,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('exposure_exceeds_leverage');
    });

    it('permits higher exposure with a higher leverage factor', () => {
      // 2x leverage (20000 bps) → vault 100 covers up to 200 exposure.
      const result = checkAcceptance({
        cp: CP,
        vaultBalance: 100n,
        quote: mkQuote({ amountOut: 200n }),
        leverageFactorBps: 20_000,
        minInsuranceRateBps: 0,
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('checkAcceptance — insurance rate rail', () => {
    it('refuses when vaultBalance × 10000 < totalExposureAfter × minInsuranceRateBps', () => {
      // minInsuranceRate = 10% (1000 bps). Require vault ≥ exposure × 10%.
      // With exposure = 100 and vault = 9, ratio = 9/100 = 9% → reject.
      // Use an enormous leverage factor so that rail is not the blocker.
      const result = checkAcceptance({
        cp: CP,
        vaultBalance: 9n,
        quote: mkQuote({ amountOut: 100n }),
        leverageFactorBps: 100_000_000, // very lax leverage so it doesn't trigger
        minInsuranceRateBps: 1_000,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('insurance_rate_below_minimum');
    });

    it('accepts exactly at the insurance floor', () => {
      // vault 10, exposure 100 → ratio = 10% exactly. OK.
      const result = checkAcceptance({
        cp: CP,
        vaultBalance: 10n,
        quote: mkQuote({ amountOut: 100n }),
        leverageFactorBps: 100_000,
        minInsuranceRateBps: 1_000,
      });
      expect(result.ok).toBe(true);
    });
  });
});
