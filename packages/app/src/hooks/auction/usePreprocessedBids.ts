'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import type { PickJson } from '@sapience/sdk/types';
import { validateBidFull } from '@sapience/sdk/auction/validation';
import type { ValidationResult } from '@sapience/sdk/auction/validation';
import type { AuctionBid } from '~/lib/auction/useAuctionBidsHub';
import { getPublicClientForChainId } from '~/lib/utils/util';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PreprocessedValidationStatus =
  | 'pending'
  | 'valid'
  | 'invalid'
  | 'unverified';

export interface PreprocessedBid extends AuctionBid {
  validationStatus: PreprocessedValidationStatus;
  validationError?: string;
}

export interface UsePreprocessedBidsOptions {
  /** Auction picks in JSON format. */
  picks?: PickJson[];
  /** Predictor address. */
  predictor?: string;
  /** Predictor collateral (wei string). */
  predictorCollateral?: string;
  /** Chain ID. */
  chainId: number;
  /** PredictionMarketEscrow address. */
  predictionMarketAddress?: Address;
  /** Collateral token address. */
  collateralTokenAddress?: Address;
  /** Enable/disable validation (default true). */
  enabled?: boolean;
  /** Sponsor address (optional). */
  predictorSponsor?: string;
  /** Sponsor data (optional). */
  predictorSponsorData?: string;
  /** Current user's address — bids from self skip async validation (already signed locally). */
  selfAddress?: string;
}

export interface UsePreprocessedBidsResult {
  /** All bids annotated with validation status. */
  processedBids: PreprocessedBid[];
  /** Only valid bids (excludes invalid, unverified, and expired). */
  validBids: PreprocessedBid[];
  /** Count of invalid + unverified bids. */
  excludedBidCount: number;
  /** Whether any validation is currently in progress. */
  isValidating: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * React hook that validates terminal auction bids using Tier 1 + Tier 2
 * validation via `validateBidFull` from the SDK.
 *
 * Used in the terminal's auction browsing view (AuctionRequestRow) where
 * users view others' auctions and decide whether to outbid. Anti-spoofing
 * is critical here — competitors must not outbid fake bids.
 *
 * Validates incrementally: only new bids (by counterpartySignature) are
 * validated. Results are cached until the auction context changes.
 */
export function usePreprocessedBids(
  rawBids: AuctionBid[],
  opts: UsePreprocessedBidsOptions
): UsePreprocessedBidsResult {
  const {
    picks,
    predictor,
    predictorCollateral,
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    enabled = true,
    predictorSponsor,
    predictorSponsorData,
    selfAddress,
  } = opts;

  const normalizedSelf = selfAddress?.toLowerCase();

  const [validationResults, setValidationResults] = useState<
    Map<string, { status: PreprocessedValidationStatus; error?: string }>
  >(new Map());
  const [isValidating, setIsValidating] = useState(false);

  // Deduplication refs
  const validatingRef = useRef<Set<string>>(new Set());
  const validatedRef = useRef<Set<string>>(new Set());

  const canValidate = useMemo(() => {
    if (!enabled || !predictionMarketAddress || !collateralTokenAddress)
      return false;
    return !!predictor && !!predictorCollateral && !!picks && picks.length > 0;
  }, [
    enabled,
    predictionMarketAddress,
    collateralTokenAddress,
    predictor,
    predictorCollateral,
    picks,
  ]);

  // Stable key for auction context — invalidate cache when context changes
  const contextKey = useMemo(() => {
    if (!picks) return '';
    const picksStr = picks
      .map(
        (p) => `${p.conditionResolver}:${p.conditionId}:${p.predictedOutcome}`
      )
      .join('|');
    return `${picksStr}:${predictorCollateral}:${predictor}:${chainId}`;
  }, [picks, predictorCollateral, predictor, chainId]);

  // Clear cache when auction context changes
  useEffect(() => {
    validatedRef.current.clear();
    validatingRef.current.clear();
    setValidationResults(new Map());
  }, [contextKey]);

  // Validate new bids incrementally
  useEffect(() => {
    if (!canValidate || rawBids.length === 0) return;

    // Self-bids are pre-validated (signed locally) — mark valid immediately
    for (const bid of rawBids) {
      if (
        normalizedSelf &&
        bid.counterparty?.toLowerCase() === normalizedSelf &&
        !validatedRef.current.has(bid.counterpartySignature)
      ) {
        validatedRef.current.add(bid.counterpartySignature);
        setValidationResults((prev) => {
          const updated = new Map(prev);
          updated.set(bid.counterpartySignature, { status: 'valid' });
          return updated;
        });
      }
    }

    const newBids = rawBids.filter((bid) => {
      if (!bid.counterparty || bid.counterparty.toLowerCase() === ZERO_ADDRESS)
        return false;
      const sig = bid.counterpartySignature;
      return !validatedRef.current.has(sig) && !validatingRef.current.has(sig);
    });

    if (newBids.length === 0) return;

    for (const bid of newBids) {
      validatingRef.current.add(bid.counterpartySignature);
    }
    setIsValidating(true);

    let cancelled = false;

    const runValidation = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const publicClient = getPublicClientForChainId(chainId) as any;

      const results = await Promise.all(
        newBids.map(
          async (
            bid
          ): Promise<
            [string, { status: PreprocessedValidationStatus; error?: string }]
          > => {
            try {
              const result: ValidationResult = await validateBidFull(
                {
                  auctionId: bid.auctionId,
                  counterparty: bid.counterparty,
                  counterpartyCollateral: bid.counterpartyCollateral,
                  counterpartyNonce: bid.counterpartyNonce,
                  counterpartyDeadline: bid.counterpartyDeadline,
                  counterpartySignature: bid.counterpartySignature,
                  counterpartySessionKeyData: bid.counterpartySessionKeyData,
                },
                {
                  predictor: predictor!,
                  predictorCollateral: predictorCollateral!,
                  picks: picks!,
                  chainId,
                  predictorSponsor,
                  predictorSponsorData,
                },
                {
                  verifyingContract: predictionMarketAddress!,
                  chainId,
                  predictionMarketAddress: predictionMarketAddress!,
                  collateralTokenAddress: collateralTokenAddress!,
                  publicClient,
                }
              );

              return [
                bid.counterpartySignature,
                {
                  status: result.status,
                  error: result.status !== 'valid' ? result.reason : undefined,
                },
              ];
            } catch {
              // Fail to unverified — anti-spoofing context means we shouldn't
              // trust bids we can't validate
              return [
                bid.counterpartySignature,
                { status: 'unverified' as const, error: 'Validation error' },
              ];
            }
          }
        )
      );

      if (cancelled) return;

      setValidationResults((prev) => {
        const updated = new Map(prev);
        for (const [sig, result] of results) {
          updated.set(sig, result);
          validatedRef.current.add(sig);
          validatingRef.current.delete(sig);
        }
        return updated;
      });

      setIsValidating(validatingRef.current.size > 0);
    };

    runValidation();

    return () => {
      cancelled = true;
    };
  }, [
    rawBids,
    canValidate,
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    predictor,
    predictorCollateral,
    picks,
    predictorSponsor,
    predictorSponsorData,
    normalizedSelf,
  ]);

  // Clean up stale entries
  useEffect(() => {
    const currentSigs = new Set(rawBids.map((b) => b.counterpartySignature));

    for (const sig of validatedRef.current) {
      if (!currentSigs.has(sig)) {
        validatedRef.current.delete(sig);
      }
    }

    setValidationResults((prev) => {
      let hasStale = false;
      for (const sig of prev.keys()) {
        if (!currentSigs.has(sig)) {
          hasStale = true;
          break;
        }
      }
      if (!hasStale) return prev;

      const updated = new Map(prev);
      for (const sig of updated.keys()) {
        if (!currentSigs.has(sig)) updated.delete(sig);
      }
      return updated;
    });
  }, [rawBids]);

  // Build processed bids
  const processedBids = useMemo((): PreprocessedBid[] => {
    return rawBids.map((bid): PreprocessedBid => {
      // Zero-address bids are always invalid
      if (
        !bid.counterparty ||
        bid.counterparty.toLowerCase() === ZERO_ADDRESS
      ) {
        return {
          ...bid,
          validationStatus: 'invalid',
          validationError: 'Missing counterparty (zero address)',
        };
      }

      const result = validationResults.get(bid.counterpartySignature);

      if (!result) {
        return {
          ...bid,
          validationStatus: canValidate ? 'pending' : 'valid',
        };
      }

      return {
        ...bid,
        validationStatus: result.status,
        validationError: result.error,
      };
    });
  }, [rawBids, validationResults, canValidate]);

  // Filter to valid + non-expired
  const validBids = useMemo((): PreprocessedBid[] => {
    const nowMs = Date.now();
    return processedBids.filter((bid) => {
      if (bid.validationStatus !== 'valid') return false;
      const deadlineSec = Number(bid.counterpartyDeadline || 0);
      if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return false;
      return deadlineSec * 1000 > nowMs;
    });
  }, [processedBids]);

  const excludedBidCount = useMemo(() => {
    return processedBids.filter(
      (bid) =>
        bid.validationStatus === 'invalid' ||
        bid.validationStatus === 'unverified'
    ).length;
  }, [processedBids]);

  return {
    processedBids,
    validBids,
    excludedBidCount,
    isValidating,
  };
}
