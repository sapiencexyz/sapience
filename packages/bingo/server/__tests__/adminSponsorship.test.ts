import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { computeSmartAccountAddress } from '@sapience/sdk/session';
import {
  grantAfterPreview,
  remainingOf,
  resolveGrantTarget,
  SPONSORED_CARD_WEI,
  validateGrantAmountUsde,
  walletCanGrant,
} from '../../src/lib/adminSponsorship.js';

const EOA = '0x1111111111111111111111111111111111111111' as Address;
const GRANT_WALLET = '0x2222222222222222222222222222222222222222' as Address;
const OWNER = '0x3333333333333333333333333333333333333333' as Address;
const SA = computeSmartAccountAddress(EOA);

describe('resolveGrantTarget', () => {
  it('derives the smart account from an EOA by default', () => {
    expect(resolveGrantTarget(EOA, false)).toBe(SA);
  });

  it('uses the address as-is when the override is set', () => {
    expect(resolveGrantTarget(SA, true)).toBe(SA);
  });

  it('returns null for invalid input', () => {
    expect(resolveGrantTarget('not-an-address', false)).toBeNull();
  });
});

describe('validateGrantAmountUsde', () => {
  it('accepts multiples of 10 USDe', () => {
    expect(validateGrantAmountUsde('10')).toEqual({
      ok: true,
      wei: SPONSORED_CARD_WEI,
    });
    expect(validateGrantAmountUsde('30')).toEqual({
      ok: true,
      wei: SPONSORED_CARD_WEI * 3n,
    });
  });

  it('rejects non-multiples and empty input', () => {
    expect(validateGrantAmountUsde('15').ok).toBe(false);
    expect(validateGrantAmountUsde('').ok).toBe(false);
    expect(validateGrantAmountUsde('0').ok).toBe(false);
  });
});

describe('grantAfterPreview', () => {
  it('shows absolute overwrite semantics', () => {
    const current = { allocated: 30n * SPONSORED_CARD_WEI, used: 20n * SPONSORED_CARD_WEI };
    const after = grantAfterPreview(current, 20n * SPONSORED_CARD_WEI);
    expect(remainingOf(after)).toBe(0n);
  });
});

describe('walletCanGrant', () => {
  it('allows budgetManager and owner', () => {
    expect(walletCanGrant(GRANT_WALLET, GRANT_WALLET, OWNER)).toBe(true);
    expect(walletCanGrant(OWNER, GRANT_WALLET, OWNER)).toBe(true);
  });

  it('denies view-only wallets', () => {
    expect(walletCanGrant(EOA, GRANT_WALLET, OWNER)).toBe(false);
  });
});
