/**
 * Batch bid validation driver for terminal and market maker consumers.
 *
 * Deduplicates bids by counterpartySignature, then runs Tier 1 + Tier 2
 * validation on each bid via `validateBidFull`. Returns bids annotated
 * with validation status.
 *
 * @module auction/bidPreprocessor
 */

import type { Address, PublicClient } from 'viem';
import type {
  AuctionRFQPayload,
  AuctionDetails,
  BidPayload,
  PickJson,
} from '../types/escrow';
import {
  validateBidFull,
  type ValidationErrorCode,
  type ValidationResult,
} from './validation';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BidPreprocessorOptions {
  chainId: number;
  predictionMarketAddress: Address;
  collateralTokenAddress: Address;
  verifyingContract: Address;
  publicClient: PublicClient;
  /** Also validate predictor solvency (default true). */
  checkPredictor?: boolean;
  /** Max concurrent validation calls (default 5). */
  concurrency?: number;
}

export interface ProcessedBid<T extends BidPayload = BidPayload> {
  bid: T;
  validationStatus: 'valid' | 'invalid' | 'unverified';
  validationError?: string;
  validationCode?: ValidationErrorCode;
}

/** Auction context — accepts both RFQ payloads and full auction details. */
type AuctionContext =
  | AuctionRFQPayload
  | AuctionDetails
  | {
      picks: PickJson[];
      predictorCollateral: string;
      predictor: string;
      chainId: number;
      predictorSponsor?: string;
      predictorSponsorData?: string;
    };

// ─── Core ────────────────────────────────────────────────────────────────────

/**
 * Validate a batch of bids for a given auction.
 *
 * 1. Deduplicates by `counterpartySignature`
 * 2. Runs Tier 1 (offline) + Tier 2 (on-chain) via `validateBidFull`
 * 3. Returns bids annotated with validation status
 */
export async function preprocessBids<T extends BidPayload>(
  bids: T[],
  auction: AuctionContext,
  opts: BidPreprocessorOptions
): Promise<ProcessedBid<T>[]> {
  if (bids.length === 0) return [];

  // Deduplicate by counterpartySignature (keep first occurrence)
  const seen = new Set<string>();
  const uniqueBids: T[] = [];
  for (const bid of bids) {
    if (seen.has(bid.counterpartySignature)) continue;
    seen.add(bid.counterpartySignature);
    uniqueBids.push(bid);
  }

  const concurrency = opts.concurrency ?? 5;
  const results: ProcessedBid<T>[] = [];

  // Process in batches to limit concurrent RPC calls
  for (let i = 0; i < uniqueBids.length; i += concurrency) {
    const batch = uniqueBids.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (bid): Promise<ProcessedBid<T>> => {
        try {
          const result = await validateBidFull(bid, auction, {
            verifyingContract: opts.verifyingContract,
            chainId: opts.chainId,
            predictionMarketAddress: opts.predictionMarketAddress,
            collateralTokenAddress: opts.collateralTokenAddress,
            publicClient: opts.publicClient,
            checkPredictor: opts.checkPredictor,
          });
          return mapResult(bid, result);
        } catch {
          return {
            bid,
            validationStatus: 'unverified',
            validationError: 'Validation threw an unexpected error',
            validationCode: 'VALIDATION_ERROR',
          };
        }
      })
    );
    results.push(...batchResults);
  }

  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapResult<T extends BidPayload>(
  bid: T,
  result: ValidationResult
): ProcessedBid<T> {
  if (result.status === 'valid') {
    return { bid, validationStatus: 'valid' };
  }
  return {
    bid,
    validationStatus: result.status,
    validationError: result.reason,
    validationCode: result.code,
  };
}

/**
 * Filter processed bids to only those that are valid.
 * Excludes both 'invalid' and 'unverified' bids.
 */
export function getValidBids<T extends BidPayload>(
  processed: ProcessedBid<T>[]
): ProcessedBid<T>[] {
  return processed.filter((p) => p.validationStatus === 'valid');
}

/**
 * Count of excluded bids (invalid + unverified).
 */
export function getExcludedBidCount<T extends BidPayload>(
  processed: ProcessedBid<T>[]
): number {
  return processed.filter((p) => p.validationStatus !== 'valid').length;
}
