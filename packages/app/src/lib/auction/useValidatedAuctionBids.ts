'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuctionBids, type AuctionBid } from '~/lib/auction/useAuctionBids';
import {
  validateBidsWithSimulation,
  type SimulateBidMintOptions,
  type SimulateBidResult,
} from '~/lib/auction/simulateBidMint';

export type ValidationStatus = 'pending' | 'valid' | 'invalid';

export type ValidatedAuctionBid = AuctionBid & {
  validationStatus: ValidationStatus;
  validationError?: string;
};

export interface UseValidatedAuctionBidsOptions {
  chainId: number;
  predictionMarketAddress?: `0x${string}`;
  takerAddress?: `0x${string}`;
  takerWager?: string;
  takerNonce?: number;
  encodedPredictedOutcomes?: `0x${string}`;
  resolver?: `0x${string}`;
  /** Whether to run validation simulations. When false, bids are returned as 'pending'. */
  enabled?: boolean;
}

export interface UseValidatedAuctionBidsResult {
  /** Raw bids from the auction (unfiltered) */
  rawBids: AuctionBid[];
  /** All bids with validation status attached */
  validatedBids: ValidatedAuctionBid[];
  /** Only bids that passed validation (valid status) */
  validBids: ValidatedAuctionBid[];
  /** Count of invalid bids */
  invalidBidCount: number;
  /** Total count of raw bids */
  totalBidCount: number;
  /** Whether validation is currently in progress */
  isValidating: boolean;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Hook that wraps useAuctionBids with mint simulation validation.
 *
 * Subscribes to raw bids via useAuctionBids and validates each bid by simulating
 * the mint transaction. Invalid bids are filtered from the validBids array while
 * still being counted in totalBidCount.
 *
 * @param auctionId - The auction ID to subscribe to
 * @param options - Auction context for validation (addresses, wagers, etc.)
 */
export function useValidatedAuctionBids(
  auctionId: string | null | undefined,
  options: UseValidatedAuctionBidsOptions
): UseValidatedAuctionBidsResult {
  const { bids: rawBids } = useAuctionBids(auctionId);

  const {
    chainId,
    predictionMarketAddress,
    takerAddress,
    takerWager,
    takerNonce,
    encodedPredictedOutcomes,
    resolver,
    enabled = true,
  } = options;

  // Track validation results by bid signature
  const [validationResults, setValidationResults] = useState<
    Map<string, SimulateBidResult>
  >(new Map());
  const [isValidating, setIsValidating] = useState(false);

  // Track which bids are currently being validated to avoid duplicate requests
  const validatingRef = useRef<Set<string>>(new Set());
  // Track which bids have been validated (mirrors validationResults keys but as a ref)
  const validatedSignaturesRef = useRef<Set<string>>(new Set());

  // Check if we have all required options for validation
  const canValidate = useMemo(() => {
    return (
      enabled &&
      !!predictionMarketAddress &&
      !!takerAddress &&
      !!takerWager &&
      takerNonce !== undefined &&
      !!encodedPredictedOutcomes &&
      !!resolver
    );
  }, [
    enabled,
    predictionMarketAddress,
    takerAddress,
    takerWager,
    takerNonce,
    encodedPredictedOutcomes,
    resolver,
  ]);

  // Validate new bids when they arrive
  useEffect(() => {
    if (!canValidate || rawBids.length === 0) return;

    // Find bids that haven't been validated yet (use ref to avoid re-running on state updates)
    const newBids = rawBids.filter((bid) => {
      const signature = bid.makerSignature;
      return (
        !validatedSignaturesRef.current.has(signature) &&
        !validatingRef.current.has(signature)
      );
    });

    if (newBids.length === 0) return;

    // Mark bids as being validated
    for (const bid of newBids) {
      validatingRef.current.add(bid.makerSignature);
    }
    setIsValidating(true);

    const simulationOptions: SimulateBidMintOptions = {
      chainId,
      predictionMarketAddress: predictionMarketAddress!,
      takerAddress: takerAddress!,
      takerWager: takerWager!,
      takerNonce: takerNonce!,
      encodedPredictedOutcomes: encodedPredictedOutcomes!,
      resolver: resolver!,
    };

    // Track cancellation for cleanup
    let cancelled = false;

    // Validate all new bids using shared function
    const runValidation = async () => {
      const validated = await validateBidsWithSimulation(
        newBids,
        simulationOptions
      );

      // Skip state updates if cancelled (unmounted or deps changed)
      if (cancelled) return;

      // Update state with new results
      setValidationResults((prev) => {
        const updated = new Map(prev);
        for (const { bid, validationStatus, validationError } of validated) {
          const result: SimulateBidResult = {
            isValid: validationStatus === 'valid',
            error: validationError,
          };
          updated.set(bid.makerSignature, result);
          validatedSignaturesRef.current.add(bid.makerSignature);
          validatingRef.current.delete(bid.makerSignature);
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
    takerAddress,
    takerWager,
    takerNonce,
    encodedPredictedOutcomes,
    resolver,
  ]);

  // Clean up validation results for bids that are no longer in rawBids
  // This prevents unbounded memory growth when running indefinitely
  useEffect(() => {
    const currentSignatures = new Set(rawBids.map((b) => b.makerSignature));

    // Clean up validatedSignaturesRef
    for (const sig of validatedSignaturesRef.current) {
      if (!currentSignatures.has(sig)) {
        validatedSignaturesRef.current.delete(sig);
      }
    }

    // Clean up validationResults state if there are stale entries
    setValidationResults((prev) => {
      let hasStale = false;
      for (const sig of prev.keys()) {
        if (!currentSignatures.has(sig)) {
          hasStale = true;
          break;
        }
      }

      if (!hasStale) return prev;

      const updated = new Map<string, SimulateBidResult>();
      for (const [sig, result] of prev) {
        if (currentSignatures.has(sig)) {
          updated.set(sig, result);
        }
      }
      return updated;
    });
  }, [rawBids]);

  // Build validated bids array with status
  const validatedBids = useMemo((): ValidatedAuctionBid[] => {
    return rawBids.map((bid): ValidatedAuctionBid => {
      // Filter out zero address bids immediately
      if (!bid.maker || bid.maker.toLowerCase() === ZERO_ADDRESS) {
        return {
          ...bid,
          validationStatus: 'invalid',
          validationError: 'Missing maker (zero address)',
        };
      }

      const result = validationResults.get(bid.makerSignature);

      if (!result) {
        // Not validated yet
        return {
          ...bid,
          validationStatus: canValidate ? 'pending' : 'valid',
          validationError: undefined,
        };
      }

      return {
        ...bid,
        validationStatus: result.isValid ? 'valid' : 'invalid',
        validationError: result.error,
      };
    });
  }, [rawBids, validationResults, canValidate]);

  // Filter to only valid bids (for chart and best bid display)
  const validBids = useMemo((): ValidatedAuctionBid[] => {
    const nowMs = Date.now();
    return validatedBids.filter((bid) => {
      // Must be valid status
      if (bid.validationStatus !== 'valid') return false;
      // Must not be expired
      const deadlineSec = Number(bid.makerDeadline || 0);
      if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return false;
      return deadlineSec * 1000 > nowMs;
    });
  }, [validatedBids]);

  // Count invalid bids
  const invalidBidCount = useMemo(() => {
    return validatedBids.filter((bid) => bid.validationStatus === 'invalid')
      .length;
  }, [validatedBids]);

  return {
    rawBids,
    validatedBids,
    validBids,
    invalidBidCount,
    totalBidCount: rawBids.length,
    isValidating,
  };
}
