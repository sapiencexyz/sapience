/**
 * Determines the auction trigger mode based on wallet/session state.
 *
 * - 'auto': session signing active — auto-fire auctions on form changes
 * - 'manual': connected wallet without session — require manual "INITIATE AUCTION" click
 * - 'auto-logged-out': no wallet connected — auto-fire for estimate display
 */
export type AuctionTriggerMode = 'auto' | 'manual' | 'auto-logged-out';

export function getAuctionTriggerMode(
  willUseSessionSigning: boolean,
  hasConnectedWallet: boolean
): AuctionTriggerMode {
  if (!hasConnectedWallet) return 'auto-logged-out';
  if (willUseSessionSigning) return 'auto';
  return 'manual';
}
