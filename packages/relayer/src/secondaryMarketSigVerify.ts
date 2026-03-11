/**
 * Secondary Market Signature Verification
 *
 * Basic validation for secondary market trade approvals.
 * The relayer is a matchmaker — it validates basic parameters (signature present,
 * deadline not expired, contract address exists) but does NOT do full off-chain
 * signature recovery. On-chain executeTrade() does the real cryptographic
 * verification, including session key support.
 */

import type { Address } from 'viem';
import { secondaryMarketEscrow } from '@sapience/sdk/contracts/addresses';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
} from '@sapience/sdk/types/secondary';

/**
 * Get the verifying contract address for a chain
 */
function getVerifyingContract(chainId: number): Address | null {
  const entry = secondaryMarketEscrow[chainId];
  if (
    !entry ||
    entry.address === '0x0000000000000000000000000000000000000000'
  ) {
    return null;
  }
  return entry.address as Address;
}

/**
 * Verify the seller's listing request has valid parameters.
 *
 * At listing time the buyer is unknown, so the seller signs a trade hash with
 * buyer = address(0). Full signature verification happens on-chain at execution.
 */
export async function verifySellerSignature(
  payload: SecondaryAuctionRequestPayload
): Promise<boolean> {
  if (!payload.sellerSignature) return false;

  const verifyingContract = getVerifyingContract(payload.chainId);
  if (!verifyingContract) {
    console.warn(
      `[Secondary-Sig] No contract address for chainId=${payload.chainId}`
    );
    return false;
  }

  // Validate deadline is in the future
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.sellerDeadline <= nowSeconds) {
    console.warn('[Secondary-Sig] Seller deadline expired');
    return false;
  }

  return true;
}

/**
 * Verify the buyer's bid has valid parameters.
 * Full signature verification happens on-chain at execution.
 */
export async function verifyBuyerSignature(
  bid: SecondaryBidPayload,
  listing: SecondaryAuctionRequestPayload
): Promise<boolean> {
  if (!bid.buyerSignature) return false;

  const verifyingContract = getVerifyingContract(listing.chainId);
  if (!verifyingContract) {
    console.warn(
      `[Secondary-Sig] No contract address for chainId=${listing.chainId}`
    );
    return false;
  }

  // Validate deadline is in the future
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (bid.buyerDeadline <= nowSeconds) {
    console.warn('[Secondary-Sig] Buyer deadline expired');
    return false;
  }

  return true;
}
