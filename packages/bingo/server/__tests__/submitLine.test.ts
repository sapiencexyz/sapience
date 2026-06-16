import { describe, expect, it } from 'vitest';
import { isStaleBidRevert } from '../submitLine.js';

// The stale-counterparty-bid revert that the auto-retry re-auctions on:
// InvalidCounterpartySignature() = keccak256("InvalidCounterpartySignature()")[:4]
const INVALID_COUNTERPARTY_SIG = '0x98595156';
// NonceAlreadyUsed() — a different, NON-retryable escrow error.
const NONCE_ALREADY_USED = '0xcabcfcbb';

describe('isStaleBidRevert', () => {
  it('matches the bare InvalidCounterpartySignature selector', () => {
    expect(isStaleBidRevert(INVALID_COUNTERPARTY_SIG)).toBe(true);
  });

  it('matches when ABI-encoded args are appended to the selector', () => {
    expect(isStaleBidRevert(`${INVALID_COUNTERPARTY_SIG}deadbeef`)).toBe(true);
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(isStaleBidRevert('  0x98595156  ')).toBe(true);
    expect(isStaleBidRevert('0X98595156')).toBe(true);
  });

  it('does not match other escrow errors (NonceAlreadyUsed)', () => {
    expect(isStaleBidRevert(NONCE_ALREADY_USED)).toBe(false);
  });

  it('does not match undefined or empty reasons', () => {
    expect(isStaleBidRevert(undefined)).toBe(false);
    expect(isStaleBidRevert('')).toBe(false);
  });

  it('does not match a selector that merely contains the bytes elsewhere', () => {
    expect(isStaleBidRevert('0xdead98595156')).toBe(false);
  });
});
