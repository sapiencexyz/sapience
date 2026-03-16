/**
 * Unified auction validation pre-processor.
 *
 * Combines field validation + signature verification into single entry points
 * that all consumers (relayer, market makers, trading terminal) share.
 *
 * @module auction/validation
 */

import {
  verifyMessage,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import type { AuctionRFQPayload, BidPayload, PickJson } from '../types/escrow';
import {
  verifyAuctionIntentSignature,
  verifyCounterpartyMintSignature,
  buildCounterpartyMintTypedData,
  hashMintApproval,
  computePredictionHashFromPicks,
} from './escrowSigning';
import { predictionMarketEscrowAbi } from '../abis';
import { isNonceUsed } from '../onchain/escrow';
import { validateCounterpartyFunds } from '../onchain/position';
import { isValidAddress, isValidSignatureFormat } from './validationUtils';

// ─── Result Types ─────────────────────────────────────────────────────────────

/** Machine-readable error codes for programmatic consumers. */
export type ValidationErrorCode =
  | 'MISSING_FIELD'
  | 'EXPIRED_DEADLINE'
  | 'DEADLINE_TOO_FAR'
  | 'INVALID_PICKS'
  | 'INVALID_SIGNATURE'
  | 'SIGNATURE_UNVERIFIABLE'
  | 'CHAIN_MISMATCH'
  | 'NONCE_USED'
  | 'PRICE_TOO_LOW'
  | 'INSUFFICIENT_BALANCE'
  | 'INSUFFICIENT_ALLOWANCE'
  | 'RPC_ERROR'
  | 'VALIDATION_ERROR';

export type ValidationResult =
  | { status: 'valid'; recoveredSigner?: Address }
  | { status: 'invalid'; code: ValidationErrorCode; reason: string }
  | {
      status: 'unverified';
      code: 'SIGNATURE_UNVERIFIABLE' | 'VALIDATION_ERROR';
      reason: string;
    };

/** Helper — every consumer should use this instead of raw status checks. */
export function isActionable(
  result: ValidationResult
): result is { status: 'valid'; recoveredSigner?: Address } {
  return result.status === 'valid';
}

// ─── Shared Helpers ───────────────────────────────────────────────────────────

/** ERC-1271 magic value */
const ERC1271_MAGIC = '0x1626ba7e';

/**
 * Minimum conditionId length: "0x" + 64 hex chars = 66 (a bytes32).
 * Longer values are valid — Pyth picks carry the full raw ABI encoding
 * (160 bytes / 322 hex chars), CT resolvers may include a deadline (64 bytes).
 * conditionId is passed as-is to the on-chain bytes field (no hashing).
 */
const MIN_CONDITION_ID_LENGTH = 66; // bytes32 = 0x + 64 hex chars

/**
 * Validates a pick in JSON/transport form (string fields).
 * Separate from `isValidPick` in escrowEncoding.ts which validates SDK-typed
 * picks (Address/Hex fields). This function operates on the wire format
 * (PickJson) that arrives over WebSocket before type casting.
 */
function isValidPickJson(pick: unknown): pick is PickJson {
  if (typeof pick !== 'object' || pick === null) return false;
  const p = pick as Record<string, unknown>;
  if (
    typeof p.conditionResolver !== 'string' ||
    !/^0x[a-fA-F0-9]{40}$/.test(p.conditionResolver)
  )
    return false;
  if (
    typeof p.conditionId !== 'string' ||
    !/^0x[a-fA-F0-9]+$/.test(p.conditionId) ||
    p.conditionId.length < MIN_CONDITION_ID_LENGTH
  )
    return false;
  if (
    typeof p.predictedOutcome !== 'number' ||
    (p.predictedOutcome !== 0 && p.predictedOutcome !== 1)
  )
    return false;
  return true;
}

function picksJsonToSdk(picks: PickJson[]): Array<{
  conditionResolver: Address;
  conditionId: Hex;
  predictedOutcome: number;
}> {
  return picks.map((p) => ({
    conditionResolver: p.conditionResolver as Address,
    conditionId: p.conditionId as Hex,
    predictedOutcome: p.predictedOutcome,
  }));
}

// ─── validateAuctionRFQ ───────────────────────────────────────────────────────

export interface ValidateAuctionRFQOptions {
  verifyingContract: Address;
  chainId?: number;
  requireSignature?: boolean; // default true
  maxDeadlineSeconds?: number; // upper bound on deadline window (anti-spam)
}

/**
 * Tier 1 validation for auction RFQ payloads.
 *
 * Combines field presence checks + deadline + pick validation + intent
 * signature verification (all 4 paths) into a single call.
 */
export async function validateAuctionRFQ(
  payload: AuctionRFQPayload,
  opts: ValidateAuctionRFQOptions
): Promise<ValidationResult> {
  const requireSignature = opts.requireSignature ?? true;

  // 1. Field presence — picks
  if (
    !payload.picks ||
    !Array.isArray(payload.picks) ||
    payload.picks.length === 0
  ) {
    return {
      status: 'invalid',
      code: 'INVALID_PICKS',
      reason: 'Invalid or empty picks array',
    };
  }

  for (let i = 0; i < payload.picks.length; i++) {
    if (!isValidPickJson(payload.picks[i])) {
      return {
        status: 'invalid',
        code: 'INVALID_PICKS',
        reason: `Invalid pick at index ${i}`,
      };
    }
  }

  // 2. Field presence — predictor address
  if (!isValidAddress(payload.predictor)) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid predictor address',
    };
  }

  // 3. Field presence — predictorCollateral
  if (!payload.predictorCollateral) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing predictorCollateral',
    };
  }
  try {
    const wager = BigInt(payload.predictorCollateral);
    if (wager <= 0n) {
      return {
        status: 'invalid',
        code: 'MISSING_FIELD',
        reason: 'predictorCollateral must be positive',
      };
    }
  } catch {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid predictorCollateral format',
    };
  }

  // 4. Field presence — nonce
  if (
    typeof payload.predictorNonce !== 'number' ||
    !Number.isFinite(payload.predictorNonce) ||
    payload.predictorNonce < 0
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid predictorNonce',
    };
  }

  // 5. Field presence — chainId
  if (
    typeof payload.chainId !== 'number' ||
    !Number.isFinite(payload.chainId) ||
    payload.chainId <= 0
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid chainId',
    };
  }

  // 6. Chain mismatch
  if (opts.chainId !== undefined && payload.chainId !== opts.chainId) {
    return {
      status: 'invalid',
      code: 'CHAIN_MISMATCH',
      reason: `Chain mismatch: payload chainId ${payload.chainId} vs expected ${opts.chainId}`,
    };
  }

  // 7. Deadline freshness
  if (
    typeof payload.predictorDeadline !== 'number' ||
    !Number.isFinite(payload.predictorDeadline)
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid predictorDeadline',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.predictorDeadline <= nowSec) {
    return {
      status: 'invalid',
      code: 'EXPIRED_DEADLINE',
      reason: 'predictorDeadline must be in the future',
    };
  }

  // 8. Deadline upper bound
  if (opts.maxDeadlineSeconds !== undefined) {
    const maxDeadline = nowSec + opts.maxDeadlineSeconds;
    if (payload.predictorDeadline > maxDeadline) {
      return {
        status: 'invalid',
        code: 'DEADLINE_TOO_FAR',
        reason: `predictorDeadline exceeds maximum (${opts.maxDeadlineSeconds}s from now)`,
      };
    }
  }

  // 9. Intent signature format check (if present)
  if (
    payload.intentSignature !== undefined &&
    payload.intentSignature !== null &&
    payload.intentSignature !== '' &&
    !isValidSignatureFormat(payload.intentSignature)
  ) {
    return {
      status: 'invalid',
      code: 'INVALID_SIGNATURE',
      reason: 'Invalid intentSignature format',
    };
  }

  // 10. Signature verification
  if (requireSignature) {
    if (!payload.intentSignature) {
      return {
        status: 'invalid',
        code: 'INVALID_SIGNATURE',
        reason: 'Missing intentSignature (required)',
      };
    }

    const sdkPicks = picksJsonToSdk(payload.picks);
    const sigResult = await verifyAuctionIntentSignature({
      picks: sdkPicks,
      predictor: payload.predictor as Address,
      predictorCollateral: BigInt(payload.predictorCollateral),
      predictorNonce: BigInt(payload.predictorNonce),
      predictorDeadline: BigInt(payload.predictorDeadline),
      intentSignature: payload.intentSignature as Hex,
      predictorSessionKeyData: payload.predictorSessionKeyData,
      verifyingContract: opts.verifyingContract,
      chainId: payload.chainId,
    });

    if (!sigResult.valid) {
      return {
        status: 'invalid',
        code: 'INVALID_SIGNATURE',
        reason: 'Intent signature verification failed',
      };
    }

    return { status: 'valid', recoveredSigner: sigResult.recoveredAddress };
  }

  // No signature required — pass
  return { status: 'valid' };
}

// ─── validateBid ──────────────────────────────────────────────────────────────

export interface ValidateBidOptions {
  verifyingContract: Address;
  chainId: number;
  verifySignature?: boolean; // default true
  publicClient?: PublicClient; // enables ERC-1271 fallback
}

/**
 * Tier 1 validation for bid payloads.
 *
 * Combines field presence + deadline freshness + signature verification
 * (all 4 paths + optional ERC-1271 on-chain fallback).
 */
export async function validateBid(
  bid: BidPayload,
  auction:
    | AuctionRFQPayload
    | {
        picks: PickJson[];
        predictorCollateral: string;
        predictor: string;
        chainId: number;
        predictorSponsor?: string;
        predictorSponsorData?: string;
      },
  opts: ValidateBidOptions
): Promise<ValidationResult> {
  const verifySignature = opts.verifySignature ?? true;

  // 1. Field presence — auctionId
  if (!bid.auctionId || typeof bid.auctionId !== 'string') {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid auctionId',
    };
  }

  // 2. Field presence — counterparty address
  if (!isValidAddress(bid.counterparty)) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid counterparty address',
    };
  }

  // 3. Field presence — counterpartyCollateral
  if (
    !bid.counterpartyCollateral ||
    typeof bid.counterpartyCollateral !== 'string'
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing counterpartyCollateral',
    };
  }
  try {
    const wager = BigInt(bid.counterpartyCollateral);
    if (wager <= 0n) {
      return {
        status: 'invalid',
        code: 'MISSING_FIELD',
        reason: 'counterpartyCollateral must be positive',
      };
    }
  } catch {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid counterpartyCollateral format',
    };
  }

  // 4. Field presence — nonce
  if (
    typeof bid.counterpartyNonce !== 'number' ||
    !Number.isFinite(bid.counterpartyNonce) ||
    bid.counterpartyNonce < 0
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid counterpartyNonce',
    };
  }

  // 5. Deadline freshness
  if (
    typeof bid.counterpartyDeadline !== 'number' ||
    !Number.isFinite(bid.counterpartyDeadline)
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Invalid counterpartyDeadline',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (bid.counterpartyDeadline <= nowSec) {
    return {
      status: 'invalid',
      code: 'EXPIRED_DEADLINE',
      reason: 'counterpartyDeadline must be in the future',
    };
  }

  // 6. Signature format
  if (!isValidSignatureFormat(bid.counterpartySignature)) {
    return {
      status: 'invalid',
      code: 'INVALID_SIGNATURE',
      reason: 'Invalid counterpartySignature format',
    };
  }

  // 7. Signature verification
  if (verifySignature) {
    const sdkPicks = picksJsonToSdk(auction.picks);

    const sigResult = await verifyCounterpartyMintSignature({
      picks: sdkPicks,
      predictorCollateral: BigInt(auction.predictorCollateral),
      counterpartyCollateral: BigInt(bid.counterpartyCollateral),
      predictor: auction.predictor as Address,
      counterparty: bid.counterparty as Address,
      counterpartyNonce: BigInt(bid.counterpartyNonce),
      counterpartyDeadline: BigInt(bid.counterpartyDeadline),
      counterpartySignature: bid.counterpartySignature as Hex,
      counterpartySessionKeyData: bid.counterpartySessionKeyData,
      predictorSponsor: (auction.predictorSponsor ?? undefined) as
        | Address
        | undefined,
      predictorSponsorData: (auction.predictorSponsorData ?? undefined) as
        | Hex
        | undefined,
      verifyingContract: opts.verifyingContract,
      chainId: opts.chainId,
    });

    if (sigResult.valid) {
      return { status: 'valid', recoveredSigner: sigResult.recoveredAddress };
    }

    // Offline paths exhausted — try ERC-1271 on-chain fallback if publicClient available
    if (opts.publicClient) {
      try {
        const typedData = buildCounterpartyMintTypedData({
          picks: sdkPicks,
          predictorCollateral: BigInt(auction.predictorCollateral),
          counterpartyCollateral: BigInt(bid.counterpartyCollateral),
          predictor: auction.predictor as Address,
          counterparty: bid.counterparty as Address,
          counterpartyNonce: BigInt(bid.counterpartyNonce),
          counterpartyDeadline: BigInt(bid.counterpartyDeadline),
          predictorSponsor: (auction.predictorSponsor ?? undefined) as
            | Address
            | undefined,
          predictorSponsorData: (auction.predictorSponsorData ?? undefined) as
            | Hex
            | undefined,
          verifyingContract: opts.verifyingContract,
          chainId: opts.chainId,
        });

        const hash = hashMintApproval({
          predictionHash: typedData.message.predictionHash as Hex,
          signer: typedData.message.signer as Address,
          collateral: typedData.message.collateral as bigint,
          nonce: typedData.message.nonce as bigint,
          deadline: typedData.message.deadline as bigint,
          verifyingContract: opts.verifyingContract,
          chainId: opts.chainId,
        });

        const result = await opts.publicClient.readContract({
          address: bid.counterparty as Address,
          abi: [
            {
              name: 'isValidSignature',
              type: 'function',
              stateMutability: 'view',
              inputs: [
                { name: 'hash', type: 'bytes32' },
                { name: 'signature', type: 'bytes' },
              ],
              outputs: [{ name: '', type: 'bytes4' }],
            },
          ] as const,
          functionName: 'isValidSignature',
          args: [hash, bid.counterpartySignature as Hex],
        });

        if (result === ERC1271_MAGIC) {
          return {
            status: 'valid',
            recoveredSigner: bid.counterparty as Address,
          };
        }

        return {
          status: 'unverified',
          code: 'SIGNATURE_UNVERIFIABLE',
          reason: 'ERC-1271 check returned wrong value',
        };
      } catch {
        return {
          status: 'unverified',
          code: 'SIGNATURE_UNVERIFIABLE',
          reason: 'ERC-1271 check failed (contract may not support it)',
        };
      }
    }

    // No publicClient — we cannot distinguish between a bad EOA signature and
    // a valid smart-contract signature (e.g. vault Approve wrapper, ERC-1271).
    // ecrecover may succeed but recover a different address simply because the
    // signature was produced for different typed data (wrapped signing schemes).
    // Without ERC-1271 fallback, treat all mismatches as unverified rather than
    // invalid — the on-chain contract is the ultimate authority.
    return {
      status: 'unverified',
      code: 'SIGNATURE_UNVERIFIABLE',
      reason: sigResult.recoveredAddress
        ? `Signature not verifiable offline (recovered ${sigResult.recoveredAddress}, expected ${bid.counterparty})`
        : 'Signature could not be verified offline',
    };
  }

  // No signature verification requested — pass
  return { status: 'valid' };
}

// ─── validateBidOnChain ───────────────────────────────────────────────────────

export interface ValidateBidOnChainOptions {
  chainId: number;
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
  publicClient: PublicClient;
  checkPredictor?: boolean; // default true
  failOpen?: boolean; // default true
  /** Skip on-chain signature verification (default false). */
  skipSignatureVerification?: boolean;
}

/**
 * Tier 2: On-chain state + signature validation.
 *
 * Validates counterparty signature via `verifyMintPartySignature()` on-chain
 * view (definitive for all sig types: EOA, smart account ERC-1271, session key),
 * plus nonce freshness + balance + allowance via RPC reads.
 *
 * This replaces the old Tier 3 (full mint simulation) approach. The protocol's
 * `verifyMintPartySignature()` view (PR #1322) gives definitive true/false
 * without needing a `signPredictorApproval` callback or state overrides.
 */
export async function validateBidOnChain(
  bid: {
    counterparty: string;
    counterpartyCollateral: string;
    counterpartyNonce: number;
    counterpartyDeadline: number;
    counterpartySignature: string;
    counterpartySessionKeyData?: string;
  },
  auction: {
    predictor: string;
    predictorCollateral: string;
    predictorNonce?: number;
    picks: PickJson[];
    predictorSponsor?: string;
    predictorSponsorData?: string;
  },
  opts: ValidateBidOnChainOptions
): Promise<ValidationResult> {
  const failOpen = opts.failOpen ?? true;
  const checkPredictor = opts.checkPredictor ?? false;
  const skipSigVerification = opts.skipSignatureVerification ?? false;
  let sigUnverified = false; // tracks smart-contract sig that couldn't be verified

  // Re-check deadline (time may have passed since Tier 1)
  const nowSec = Math.floor(Date.now() / 1000);
  if (bid.counterpartyDeadline <= nowSec) {
    return {
      status: 'invalid',
      code: 'EXPIRED_DEADLINE',
      reason: 'Bid has expired',
    };
  }

  try {
    // 1. On-chain signature verification via verifyMintPartySignature()
    if (!skipSigVerification) {
      const sdkPicks = picksJsonToSdk(auction.picks);
      const predictionHash = computePredictionHashFromPicks(
        sdkPicks,
        BigInt(auction.predictorCollateral),
        BigInt(bid.counterpartyCollateral),
        auction.predictor as Address,
        bid.counterparty as Address,
        (auction.predictorSponsor as Address) || zeroAddress,
        (auction.predictorSponsorData as Hex) || '0x'
      );

      const isValid = await opts.publicClient.readContract({
        address: opts.predictionMarketAddress,
        abi: predictionMarketEscrowAbi,
        functionName: 'verifyMintPartySignature',
        args: [
          predictionHash,
          bid.counterparty as Address,
          BigInt(bid.counterpartyCollateral),
          BigInt(bid.counterpartyNonce),
          BigInt(bid.counterpartyDeadline),
          bid.counterpartySignature as Hex,
          (bid.counterpartySessionKeyData || '0x') as Hex,
        ],
      });

      if (!isValid) {
        // Smart contract counterparties (e.g. vaults) use wrapped ERC-1271
        // signatures that verifyMintPartySignature may not fully support.
        // Check if the counterparty is a contract — if so, treat as
        // unverified rather than invalid. The on-chain mint() is the
        // definitive authority for signature verification.
        const code = await opts.publicClient.getCode({
          address: bid.counterparty as Address,
        });
        const isContract =
          code !== undefined && code !== '0x' && code.length > 2;

        if (isContract) {
          // Smart contract counterparty — don't reject, continue to nonce/balance
          // checks. The on-chain mint() is the definitive signature authority.
          sigUnverified = true;
        } else {
          return {
            status: 'invalid',
            code: 'INVALID_SIGNATURE',
            reason:
              'On-chain signature verification failed (verifyMintPartySignature)',
          };
        }
      }
    }

    // 2. Counterparty nonce freshness
    const nonceUsed = await isNonceUsed(
      bid.counterparty as Address,
      BigInt(bid.counterpartyNonce),
      {
        chainId: opts.chainId,
        marketAddress: opts.predictionMarketAddress,
        publicClient: opts.publicClient,
      }
    );
    if (nonceUsed) {
      return {
        status: 'invalid',
        code: 'NONCE_USED',
        reason: 'Bidder nonce is stale',
      };
    }

    // 2b. Predictor nonce freshness (when provided)
    if (auction.predictorNonce != null) {
      const predictorNonceUsed = await isNonceUsed(
        auction.predictor as Address,
        BigInt(auction.predictorNonce),
        {
          chainId: opts.chainId,
          marketAddress: opts.predictionMarketAddress,
          publicClient: opts.publicClient,
        }
      );
      if (predictorNonceUsed) {
        return {
          status: 'invalid',
          code: 'NONCE_USED',
          reason: 'Predictor nonce is stale',
        };
      }
    }

    // 3. Counterparty balance/allowance
    await validateCounterpartyFunds(
      bid.counterparty as Address,
      BigInt(bid.counterpartyCollateral),
      opts.collateralTokenAddress,
      opts.predictionMarketAddress,
      opts.publicClient
    );

    // 4. Predictor solvency (optional)
    if (checkPredictor) {
      await validateCounterpartyFunds(
        auction.predictor as Address,
        BigInt(auction.predictorCollateral),
        opts.collateralTokenAddress,
        opts.predictionMarketAddress,
        opts.publicClient
      );
    }

    if (sigUnverified) {
      return {
        status: 'unverified',
        code: 'SIGNATURE_UNVERIFIABLE',
        reason:
          'Smart contract signature could not be verified via verifyMintPartySignature (nonce/balance OK)',
      };
    }

    return { status: 'valid' };
  } catch (err) {
    // validateCounterpartyFunds (position.ts) throws with a message containing
    // 'market maker' on insufficient funds. A future refactor should introduce
    // a typed error class in position.ts instead of this string coupling.
    if (err instanceof Error && err.message.includes('market maker')) {
      return {
        status: 'invalid',
        code: 'INSUFFICIENT_BALANCE',
        reason: err.message,
      };
    }

    // RPC/network error
    if (failOpen) {
      return { status: 'valid' };
    }

    return {
      status: 'invalid',
      code: 'RPC_ERROR',
      reason: `RPC error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── validateBidFull ──────────────────────────────────────────────────────────

export interface ValidateBidFullOptions {
  verifyingContract: Address;
  chainId: number;
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
  publicClient: PublicClient;
  checkPredictor?: boolean;
}

/**
 * Tier 1 + Tier 2 combined.
 *
 * Runs `validateBid` (offline) then `validateBidOnChain` (on-chain state).
 * Short-circuits on first failure.
 */
export async function validateBidFull(
  bid: BidPayload,
  auction:
    | AuctionRFQPayload
    | {
        picks: PickJson[];
        predictorCollateral: string;
        predictor: string;
        chainId: number;
        predictorSponsor?: string;
        predictorSponsorData?: string;
      },
  opts: ValidateBidFullOptions
): Promise<ValidationResult> {
  // Tier 1: offline
  const tier1 = await validateBid(bid, auction, {
    verifyingContract: opts.verifyingContract,
    chainId: opts.chainId,
    publicClient: opts.publicClient,
  });

  if (tier1.status !== 'valid') {
    return tier1;
  }

  // Tier 2: on-chain state + signature verification
  return validateBidOnChain(
    {
      counterparty: bid.counterparty,
      counterpartyCollateral: bid.counterpartyCollateral,
      counterpartyNonce: bid.counterpartyNonce,
      counterpartyDeadline: bid.counterpartyDeadline,
      counterpartySignature: bid.counterpartySignature,
      counterpartySessionKeyData: bid.counterpartySessionKeyData,
    },
    auction,
    {
      chainId: opts.chainId,
      predictionMarketAddress: opts.predictionMarketAddress,
      collateralTokenAddress: opts.collateralTokenAddress,
      publicClient: opts.publicClient,
      checkPredictor: opts.checkPredictor,
    }
  );
}

// ─── validateVaultQuote ───────────────────────────────────────────────────────

export interface ValidateVaultQuoteOptions {
  maxAgeMs?: number; // default 5 minutes
}

/**
 * Validates a vault quote: field presence + timestamp window + signature.
 *
 * The on-chain manager authorization check stays in the relayer
 * (relayer-specific authorization layer).
 */
export async function validateVaultQuote(
  quote: {
    vaultAddress?: string;
    chainId?: number;
    timestamp?: number;
    vaultCollateralPerShare?: string;
    signedBy?: string;
    signature?: string;
  },
  opts?: ValidateVaultQuoteOptions
): Promise<ValidationResult> {
  const maxAgeMs = opts?.maxAgeMs ?? 5 * 60 * 1000;

  // Field presence
  if (!quote.vaultAddress || !isValidAddress(quote.vaultAddress)) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing or invalid vaultAddress',
    };
  }

  if (
    typeof quote.chainId !== 'number' ||
    !Number.isFinite(quote.chainId) ||
    quote.chainId <= 0
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing or invalid chainId',
    };
  }

  if (
    typeof quote.timestamp !== 'number' ||
    !Number.isFinite(quote.timestamp)
  ) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing or invalid timestamp',
    };
  }

  if (!quote.vaultCollateralPerShare) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing vaultCollateralPerShare',
    };
  }

  if (!quote.signedBy || !isValidAddress(quote.signedBy)) {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing or invalid signedBy',
    };
  }

  if (!quote.signature || typeof quote.signature !== 'string') {
    return {
      status: 'invalid',
      code: 'MISSING_FIELD',
      reason: 'Missing signature',
    };
  }

  // Timestamp window
  const now = Date.now();
  const quoteAgeMs = now - quote.timestamp;
  if (Math.abs(quoteAgeMs) > maxAgeMs) {
    return {
      status: 'invalid',
      code: 'EXPIRED_DEADLINE',
      reason: 'Vault quote timestamp outside acceptable window',
    };
  }

  // Signature verification — canonical message format must match relayer's buildVaultQuoteMessage
  try {
    const message = [
      'Sapience Vault Share Quote',
      `Vault: ${quote.vaultAddress.toLowerCase()}`,
      `ChainId: ${quote.chainId}`,
      `CollateralPerShare: ${quote.vaultCollateralPerShare}`,
      `Timestamp: ${quote.timestamp}`,
    ].join('\n');

    const valid = await verifyMessage({
      address: quote.signedBy as Address,
      message,
      signature: quote.signature as Hex,
    });

    if (!valid) {
      return {
        status: 'invalid',
        code: 'INVALID_SIGNATURE',
        reason: 'Vault quote signature verification failed',
      };
    }

    return { status: 'valid', recoveredSigner: quote.signedBy as Address };
  } catch {
    return {
      status: 'invalid',
      code: 'INVALID_SIGNATURE',
      reason: 'Vault quote signature verification failed',
    };
  }
}
