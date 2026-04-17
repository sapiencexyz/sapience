/**
 * Committed-Intent quality gate tests (PRD-001 §4.3.2).
 */

import { describe, it, expect, vi } from 'vitest';
import { type Address, type Hex, type PublicClient } from 'viem';
import type { Commitment } from '@sapience/sdk/types/committedIntent';
import {
  checkDeadline,
  checkMinAmountIn,
  checkPickConfigHasMarket,
} from '../committedIntentQualityGate';
import { config } from '../config';

function mkCommitment(overrides?: Partial<Commitment>): Commitment {
  return {
    predictor: '0x0000000000000000000000000000000000000001' as Address,
    predictorWindowEnd: 1800000060n,
    deadline: 1800000120n,
    pickConfigId:
      '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex,
    amountIn: 100n * 10n ** 18n,
    minFillIn: 60n * 10n ** 18n,
    minAmountOut: 150n * 10n ** 18n,
    executorTip: 10n ** 18n,
    nonce: 42n,
    ...overrides,
  };
}

describe('checkDeadline', () => {
  it('passes for non-sponsored regardless of length', () => {
    const now = 1_700_000_000;
    const c = mkCommitment({ deadline: BigInt(now + 999_999) });
    const res = checkDeadline(c, false, now);
    expect(res.ok).toBe(true);
  });

  it('passes for sponsored within the max window', () => {
    const now = 1_700_000_000;
    const within =
      now +
      Math.min(config.COMMITTED_INTENT_MAX_SPONSORED_DEADLINE_SECONDS, 30);
    const c = mkCommitment({ deadline: BigInt(within) });
    const res = checkDeadline(c, true, now);
    expect(res.ok).toBe(true);
  });

  it('rejects sponsored beyond max window', () => {
    const now = 1_700_000_000;
    const far =
      now + config.COMMITTED_INTENT_MAX_SPONSORED_DEADLINE_SECONDS + 1;
    const c = mkCommitment({ deadline: BigInt(far) });
    const res = checkDeadline(c, true, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('sponsored_deadline_too_far');
  });

  it('rejects sponsored when deadline is in the past', () => {
    const now = 1_700_000_000;
    const c = mkCommitment({ deadline: BigInt(now - 1) });
    const res = checkDeadline(c, true, now);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('deadline_in_past');
  });
});

describe('checkMinAmountIn', () => {
  it('passes for non-sponsored any amount', () => {
    const c = mkCommitment({ amountIn: 1n });
    expect(checkMinAmountIn(c, false).ok).toBe(true);
  });

  it('passes for sponsored at or above the min', () => {
    const c = mkCommitment({
      amountIn: config.COMMITTED_INTENT_MIN_SPONSORED_AMOUNT_IN,
    });
    expect(checkMinAmountIn(c, true).ok).toBe(true);
  });

  it('rejects sponsored below the min', () => {
    const c = mkCommitment({
      amountIn: config.COMMITTED_INTENT_MIN_SPONSORED_AMOUNT_IN - 1n,
    });
    const res = checkMinAmountIn(c, true);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('amount_in_below_sponsored_min');
  });
});

describe('checkPickConfigHasMarket', () => {
  it('accepts when no publicClient is provided (warn-and-skip)', async () => {
    const pickConfigId =
      '0x1111111111111111111111111111111111111111111111111111111111111111';
    const res = await checkPickConfigHasMarket(pickConfigId);
    expect(res.ok).toBe(true);
  });

  it('accepts when both tokens are returned non-zero', async () => {
    const publicClient = {
      readContract: vi
        .fn()
        .mockResolvedValue([
          '0x0000000000000000000000000000000000000001',
          '0x0000000000000000000000000000000000000002',
        ]),
    } as unknown as PublicClient;

    const res = await checkPickConfigHasMarket(
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      publicClient,
      '0x0000000000000000000000000000000000000abc' as Address
    );
    expect(res.ok).toBe(true);
  });

  it('rejects when readContract returns the zero token pair', async () => {
    const publicClient = {
      readContract: vi
        .fn()
        .mockResolvedValue([
          '0x0000000000000000000000000000000000000000',
          '0x0000000000000000000000000000000000000000',
        ]),
    } as unknown as PublicClient;

    const res = await checkPickConfigHasMarket(
      '0x3333333333333333333333333333333333333333333333333333333333333333',
      publicClient,
      '0x0000000000000000000000000000000000000abc' as Address
    );
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('unknown_pick_config');
  });

  it('swallows readContract errors and accepts', async () => {
    const publicClient = {
      readContract: vi.fn().mockRejectedValue(new Error('network error')),
    } as unknown as PublicClient;
    const res = await checkPickConfigHasMarket(
      '0x4444444444444444444444444444444444444444444444444444444444444444',
      publicClient,
      '0x0000000000000000000000000000000000000abc' as Address
    );
    expect(res.ok).toBe(true);
  });
});
