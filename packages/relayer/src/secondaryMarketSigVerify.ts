/**
 * Secondary Market Signature Verification
 *
 * Validates secondary market trade approvals with real EIP-712 signature
 * recovery for EOA signatures. Session key signatures (identified by the
 * presence of sessionKeyData) are passed through — on-chain executeTrade()
 * does the definitive verification for those.
 */

import { verifyTypedData, type Address, type Hex } from 'viem';
import { secondaryMarketEscrow } from '@sapience/sdk/contracts/addresses';
import {
  computeTradeHash,
  getSecondaryDomain,
  TRADE_APPROVAL_TYPES,
} from '@sapience/sdk/auction/secondarySigning';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
} from '@sapience/sdk/types/secondary';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Get the verifying contract address for a chain
 */
function getVerifyingContract(chainId: number): Address | null {
  const entry = secondaryMarketEscrow[chainId];
  if (!entry || entry.address === ZERO_ADDRESS) {
    return null;
  }
  return entry.address as Address;
}

/**
 * Verify the seller's listing request.
 *
 * At listing time the buyer is unknown, so the seller signs a trade hash with
 * buyer = address(0). For EOA signatures (no sessionKeyData), we recover the
 * signer via EIP-712 and compare to payload.seller. Session key signatures
 * are passed through — on-chain executeTrade() does the definitive check.
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

  // Session key signatures can't be verified off-chain (ECDSA recovery
  // would recover the session key, not the smart account address).
  // On-chain executeTrade() handles full session key verification.
  // Validate hex format as defense-in-depth (SDK tier-1 also checks this).
  if (payload.sellerSessionKeyData) {
    if (!/^0x[a-fA-F0-9]+$/.test(payload.sellerSessionKeyData)) {
      console.warn('[Secondary-Sig] Invalid sellerSessionKeyData hex format');
      return false;
    }
    return true;
  }

  // EOA signature: verify via EIP-712 typed data recovery
  try {
    const tradeHash = computeTradeHash(
      payload.token as Address,
      payload.collateral as Address,
      payload.seller as Address,
      ZERO_ADDRESS, // buyer unknown at listing time
      BigInt(payload.tokenAmount),
      0n // price unknown at listing time — hardcoded to 0
    );

    const domain = getSecondaryDomain(verifyingContract, payload.chainId);

    const isValid = await verifyTypedData({
      address: payload.seller as Address,
      domain,
      types: TRADE_APPROVAL_TYPES,
      primaryType: 'TradeApproval',
      message: {
        tradeHash,
        signer: payload.seller as Address,
        nonce: BigInt(payload.sellerNonce),
        deadline: BigInt(payload.sellerDeadline),
      },
      signature: payload.sellerSignature as Hex,
    });

    if (!isValid) {
      console.warn(
        `[Secondary-Sig] Seller signature verification failed for ${payload.seller.slice(0, 10)}`
      );
    }
    return isValid;
  } catch (err) {
    console.warn('[Secondary-Sig] Seller signature verification error:', err);
    return false;
  }
}

/**
 * Verify the buyer's bid.
 *
 * For EOA signatures (no sessionKeyData), we recover the signer via EIP-712
 * and compare to bid.buyer. Session key signatures are passed through.
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

  // Session key signatures: pass through to on-chain verification
  // Validate hex format as defense-in-depth (SDK tier-1 also checks this).
  if (bid.buyerSessionKeyData) {
    if (!/^0x[a-fA-F0-9]+$/.test(bid.buyerSessionKeyData)) {
      console.warn('[Secondary-Sig] Invalid buyerSessionKeyData hex format');
      return false;
    }
    return true;
  }

  // EOA signature: verify via EIP-712 typed data recovery
  try {
    const tradeHash = computeTradeHash(
      listing.token as Address,
      listing.collateral as Address,
      listing.seller as Address,
      bid.buyer as Address,
      BigInt(listing.tokenAmount),
      BigInt(bid.price)
    );

    const domain = getSecondaryDomain(verifyingContract, listing.chainId);

    const isValid = await verifyTypedData({
      address: bid.buyer as Address,
      domain,
      types: TRADE_APPROVAL_TYPES,
      primaryType: 'TradeApproval',
      message: {
        tradeHash,
        signer: bid.buyer as Address,
        nonce: BigInt(bid.buyerNonce),
        deadline: BigInt(bid.buyerDeadline),
      },
      signature: bid.buyerSignature as Hex,
    });

    if (!isValid) {
      console.warn(
        `[Secondary-Sig] Buyer signature verification failed for ${bid.buyer.slice(0, 10)}`
      );
    }
    return isValid;
  } catch (err) {
    console.warn('[Secondary-Sig] Buyer signature verification error:', err);
    return false;
  }
}
