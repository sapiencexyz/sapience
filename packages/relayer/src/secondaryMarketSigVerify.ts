/**
 * Secondary Market Signature Verification
 * Verifies EIP-712 typed data signatures for secondary market trade approvals
 */

import { recoverTypedDataAddress, type Address, type Hex } from 'viem';
import {
  buildTradeApprovalTypedData,
  computeTradeHash,
} from '@sapience/sdk/auction/secondarySigning';
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
  if (!entry || entry.address === '0x0000000000000000000000000000000000000000') {
    return null;
  }
  return entry.address as Address;
}

/**
 * Convert typed data with bigint chainId to number for viem compatibility
 */
function convertChainId<T extends { domain: { chainId?: bigint | number } }>(
  typedData: T
): T & { domain: { chainId?: number } } {
  return {
    ...typedData,
    domain: {
      ...typedData.domain,
      chainId:
        typedData.domain.chainId !== undefined
          ? Number(typedData.domain.chainId)
          : undefined,
    },
  };
}

/**
 * Verify the seller's EIP-712 TradeApproval signature for an auction listing.
 *
 * At listing time the buyer is unknown, so the seller signs a trade hash with
 * buyer = address(0). This matches the approach in the existing v2 auction
 * where the predictor signs before a counterparty is known.
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

  try {
    // Validate deadline is in the future
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (payload.sellerDeadline <= nowSeconds) {
      console.warn('[Secondary-Sig] Seller deadline expired');
      return false;
    }

    // Compute trade hash with buyer = zero address (unknown at listing time)
    const zeroBuyer = '0x0000000000000000000000000000000000000000' as Address;
    const tradeHash = computeTradeHash(
      payload.token as Address,
      payload.collateral as Address,
      payload.seller as Address,
      zeroBuyer,
      BigInt(payload.tokenAmount),
      BigInt(payload.minPrice)
    );

    const rawTypedData = buildTradeApprovalTypedData({
      tradeHash,
      signer: payload.seller as Address,
      nonce: BigInt(payload.sellerNonce),
      deadline: BigInt(payload.sellerDeadline),
      verifyingContract,
      chainId: payload.chainId,
    });

    const typedData = convertChainId(rawTypedData);

    const recoveredSigner = await recoverTypedDataAddress({
      ...typedData,
      signature: payload.sellerSignature as Hex,
    });

    if (recoveredSigner.toLowerCase() === payload.seller.toLowerCase()) {
      return true;
    }

    console.warn('[Secondary-Sig] Seller signature mismatch:', {
      expected: payload.seller,
      recovered: recoveredSigner,
    });
    return false;
  } catch (error) {
    console.error('[Secondary-Sig] Seller verification error:', error);
    return false;
  }
}

/**
 * Verify the buyer's EIP-712 TradeApproval signature for a bid.
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

  try {
    // Validate deadline is in the future
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (bid.buyerDeadline <= nowSeconds) {
      console.warn('[Secondary-Sig] Buyer deadline expired');
      return false;
    }

    // Compute trade hash with the specific buyer
    const tradeHash = computeTradeHash(
      listing.token as Address,
      listing.collateral as Address,
      listing.seller as Address,
      bid.buyer as Address,
      BigInt(listing.tokenAmount),
      BigInt(bid.price)
    );

    const rawTypedData = buildTradeApprovalTypedData({
      tradeHash,
      signer: bid.buyer as Address,
      nonce: BigInt(bid.buyerNonce),
      deadline: BigInt(bid.buyerDeadline),
      verifyingContract,
      chainId: listing.chainId,
    });

    const typedData = convertChainId(rawTypedData);

    const recoveredSigner = await recoverTypedDataAddress({
      ...typedData,
      signature: bid.buyerSignature as Hex,
    });

    if (recoveredSigner.toLowerCase() === bid.buyer.toLowerCase()) {
      return true;
    }

    console.warn('[Secondary-Sig] Buyer signature mismatch:', {
      expected: bid.buyer,
      recovered: recoveredSigner,
    });
    return false;
  } catch (error) {
    console.error('[Secondary-Sig] Buyer verification error:', error);
    return false;
  }
}
