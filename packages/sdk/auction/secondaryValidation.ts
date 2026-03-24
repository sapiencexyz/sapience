/**
 * Secondary market validation — tier 1 (offline).
 *
 * Mirrors the escrow validation pattern: field presence + deadline freshness +
 * signature verification via EIP-712 recovery. Session key signatures return
 * 'unverified' (not blindly 'valid') — the relayer passes them through and
 * on-chain executeTrade() is the definitive authority.
 *
 * @module auction/secondaryValidation
 */

import { verifyTypedData, zeroAddress, type Address, type Hex } from 'viem';
import type {
  SecondaryAuctionRequestPayload,
  SecondaryBidPayload,
} from '../types/secondary';
import {
  computeTradeHash,
  getSecondaryDomain,
  TRADE_APPROVAL_TYPES,
} from './secondarySigning';
import type { ValidationResult, ValidationErrorCode } from './validation';
import { isValidAddress, isValidSignatureFormat } from './validationUtils';

// Re-export so relayer consumers don't need two imports
export type { ValidationResult, ValidationErrorCode };
export { isActionable } from './validation';

function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value);
}

function isPositiveWei(value: unknown): boolean {
  if (!value || typeof value !== 'string') return false;
  try {
    return BigInt(value) > 0n;
  } catch {
    return false;
  }
}

function invalid(
  code: ValidationErrorCode,
  reason: string
): ValidationResult & { status: 'invalid' } {
  return { status: 'invalid', code, reason };
}

// ─── validateSecondaryListing ─────────────────────────────────────────────────

export interface ValidateSecondaryListingOptions {
  verifyingContract: Address;
  chainId?: number;
  verifySignature?: boolean; // default true
  maxDeadlineSeconds?: number; // upper bound on deadline window (anti-spam)
}

/**
 * Tier 1 validation for secondary market listing payloads.
 *
 * Combines field presence + deadline + signature verification.
 * Session key signatures return 'unverified' — on-chain verification is needed.
 */
export async function validateSecondaryListing(
  payload: SecondaryAuctionRequestPayload,
  opts: ValidateSecondaryListingOptions
): Promise<ValidationResult> {
  const verifySignature = opts.verifySignature ?? true;

  // 1. Field presence — token address
  if (!isValidAddress(payload.token)) {
    return invalid('MISSING_FIELD', 'Invalid token address');
  }

  // 2. Field presence — collateral address
  if (!isValidAddress(payload.collateral)) {
    return invalid('MISSING_FIELD', 'Invalid collateral address');
  }

  // 3. Field presence — seller address
  if (!isValidAddress(payload.seller)) {
    return invalid('MISSING_FIELD', 'Invalid seller address');
  }

  // 4. Field presence — tokenAmount
  if (!isPositiveWei(payload.tokenAmount)) {
    return invalid(
      'MISSING_FIELD',
      'tokenAmount must be a positive wei string'
    );
  }

  // 5. Field presence — nonce
  if (
    typeof payload.sellerNonce !== 'number' ||
    !Number.isFinite(payload.sellerNonce) ||
    payload.sellerNonce < 0
  ) {
    return invalid('MISSING_FIELD', 'Invalid sellerNonce');
  }

  // 6. Field presence — chainId
  if (
    typeof payload.chainId !== 'number' ||
    !Number.isFinite(payload.chainId) ||
    payload.chainId <= 0
  ) {
    return invalid('MISSING_FIELD', 'Invalid chainId');
  }

  // 7. Chain mismatch
  if (opts.chainId !== undefined && payload.chainId !== opts.chainId) {
    return invalid(
      'CHAIN_MISMATCH',
      `Chain mismatch: payload chainId ${payload.chainId} vs expected ${opts.chainId}`
    );
  }

  // 8. Deadline freshness
  if (
    typeof payload.sellerDeadline !== 'number' ||
    !Number.isFinite(payload.sellerDeadline)
  ) {
    return invalid('MISSING_FIELD', 'Invalid sellerDeadline');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.sellerDeadline <= nowSec) {
    return invalid('EXPIRED_DEADLINE', 'sellerDeadline must be in the future');
  }

  // 9. Deadline upper bound
  if (opts.maxDeadlineSeconds !== undefined) {
    const maxDeadline = nowSec + opts.maxDeadlineSeconds;
    if (payload.sellerDeadline > maxDeadline) {
      return invalid(
        'DEADLINE_TOO_FAR',
        `sellerDeadline exceeds maximum (${opts.maxDeadlineSeconds}s from now)`
      );
    }
  }

  // 10. Signature format
  if (!isValidSignatureFormat(payload.sellerSignature)) {
    return invalid('INVALID_SIGNATURE', 'Invalid sellerSignature format');
  }

  // 11. Session key data format validation (if present)
  if (
    payload.sellerSessionKeyData !== undefined &&
    payload.sellerSessionKeyData !== '' &&
    !isValidHex(payload.sellerSessionKeyData)
  ) {
    return invalid(
      'INVALID_SIGNATURE',
      'sellerSessionKeyData must be valid hex'
    );
  }

  // 12. Signature verification
  if (verifySignature) {
    // Session key signatures cannot be verified offline — ECDSA recovery
    // would recover the session key address, not the smart account address.
    // Return 'unverified' so the relayer passes them through (matching escrow
    // pattern) and on-chain executeTrade() does definitive verification.
    if (payload.sellerSessionKeyData) {
      return {
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason:
          'Seller has session key data — cannot verify offline, on-chain verification required',
      };
    }

    // EOA signature: verify via EIP-712 typed data recovery
    try {
      const tradeHash = computeTradeHash(
        payload.token as Address,
        payload.collateral as Address,
        payload.seller as Address,
        zeroAddress, // buyer unknown at listing time
        BigInt(payload.tokenAmount),
        0n // price unknown at listing time — hardcoded to 0
      );

      const domain = getSecondaryDomain(
        opts.verifyingContract,
        payload.chainId
      );

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

      if (isValid) {
        return {
          status: 'valid',
          recoveredSigner: payload.seller as Address,
        };
      }

      // Offline mismatch — could be a smart-contract signature. Without
      // on-chain ERC-1271 check, return 'unverified' (not 'invalid').
      return {
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason:
          'Seller signature could not be verified offline (may be a smart account)',
      };
    } catch {
      return {
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason: 'Seller signature verification threw an error',
      };
    }
  }

  // No signature verification requested
  return { status: 'valid' };
}

// ─── validateSecondaryBid ─────────────────────────────────────────────────────

export interface ValidateSecondaryBidOptions {
  verifyingContract: Address;
  chainId: number;
  verifySignature?: boolean; // default true
}

/**
 * Tier 1 validation for secondary market bid payloads.
 *
 * Combines field presence + deadline + signature verification.
 * Session key signatures return 'unverified'.
 */
export async function validateSecondaryBid(
  bid: SecondaryBidPayload,
  listing: SecondaryAuctionRequestPayload,
  opts: ValidateSecondaryBidOptions
): Promise<ValidationResult> {
  const verifySignature = opts.verifySignature ?? true;

  // 1. Field presence — auctionId
  if (!bid.auctionId || typeof bid.auctionId !== 'string') {
    return invalid('MISSING_FIELD', 'Invalid auctionId');
  }

  // 2. Field presence — buyer address
  if (!isValidAddress(bid.buyer)) {
    return invalid('MISSING_FIELD', 'Invalid buyer address');
  }

  // 3. Field presence — price
  if (!isPositiveWei(bid.price)) {
    return invalid('MISSING_FIELD', 'price must be a positive wei string');
  }

  // 4. Field presence — nonce
  if (
    typeof bid.buyerNonce !== 'number' ||
    !Number.isFinite(bid.buyerNonce) ||
    bid.buyerNonce < 0
  ) {
    return invalid('MISSING_FIELD', 'Invalid buyerNonce');
  }

  // 5. Deadline freshness
  if (
    typeof bid.buyerDeadline !== 'number' ||
    !Number.isFinite(bid.buyerDeadline)
  ) {
    return invalid('MISSING_FIELD', 'Invalid buyerDeadline');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (bid.buyerDeadline <= nowSec) {
    return invalid('EXPIRED_DEADLINE', 'buyerDeadline must be in the future');
  }

  // 6. Signature format
  if (!isValidSignatureFormat(bid.buyerSignature)) {
    return invalid('INVALID_SIGNATURE', 'Invalid buyerSignature format');
  }

  // 7. Session key data format validation (if present)
  if (
    bid.buyerSessionKeyData !== undefined &&
    bid.buyerSessionKeyData !== '' &&
    !isValidHex(bid.buyerSessionKeyData)
  ) {
    return invalid(
      'INVALID_SIGNATURE',
      'buyerSessionKeyData must be valid hex'
    );
  }

  // 8. Signature verification
  if (verifySignature) {
    // Session key signatures: return unverified, let on-chain handle it
    if (bid.buyerSessionKeyData) {
      return {
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason:
          'Buyer has session key data — cannot verify offline, on-chain verification required',
      };
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

      const domain = getSecondaryDomain(opts.verifyingContract, opts.chainId);

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

      if (isValid) {
        return { status: 'valid', recoveredSigner: bid.buyer as Address };
      }

      // Offline mismatch — could be a smart-contract signature
      return {
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason:
          'Buyer signature could not be verified offline (may be a smart account)',
      };
    } catch {
      return {
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason: 'Buyer signature verification threw an error',
      };
    }
  }

  // No signature verification requested
  return { status: 'valid' };
}
