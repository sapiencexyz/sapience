import { getAuctionTriggerMode } from './auctionTriggerMode';

describe('getAuctionTriggerMode', () => {
  it('returns "auto" when session signing is active and wallet is connected', () => {
    expect(getAuctionTriggerMode(true, true)).toBe('auto');
  });

  it('returns "manual" when wallet is connected but no session signing', () => {
    expect(getAuctionTriggerMode(false, true)).toBe('manual');
  });

  it('returns "auto-logged-out" when wallet is not connected', () => {
    expect(getAuctionTriggerMode(false, false)).toBe('auto-logged-out');
  });

  it('returns "auto-logged-out" when session signing but disconnected (edge case)', () => {
    // willUseSessionSigning shouldn't be true without a wallet, but if it is,
    // disconnected state takes priority
    expect(getAuctionTriggerMode(true, false)).toBe('auto-logged-out');
  });
});
