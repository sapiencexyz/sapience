'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address, Hex } from 'viem';
import type { SimulateBidResult } from '@sapience/sdk/auction/simulate';
import type { Pick } from '@sapience/sdk/types';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import {
  simulateEscrowBidMint,
  validateEscrowBidLightweight,
} from '~/lib/auction/simulateEscrowBidMint';
import { logBidValidation } from '~/lib/auction/bidLogger';

export type ValidationStatus = 'pending' | 'valid' | 'invalid';

export interface UseValidatedEscrowBidsOptions {
  chainId: number;
  predictionMarketAddress?: Address;
  collateralTokenAddress?: Address;
  predictorAddress?: Address;
  predictorCollateral?: string; // wei
  picks?: Pick[];
  isSponsored?: boolean;
  sponsorAddress?: Address;
  /** Session mode signing function. When provided, uses full simulation. Otherwise uses lightweight checks. */
  signPredictorApproval?:
    | ((params: {
        domain: {
          name?: string;
          version?: string;
          chainId?: number;
          verifyingContract?: Address;
        };
        types: Record<
          string,
          readonly { readonly name: string; readonly type: string }[]
        >;
        primaryType: string;
        message: Record<string, unknown>;
      }) => Promise<Hex>)
    | null;
  enabled?: boolean;
}

export interface UseValidatedEscrowBidsResult {
  validatedBids: QuoteBid[];
  validBids: QuoteBid[];
  invalidBidCount: number;
  isValidating: boolean;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Hook that wraps raw QuoteBid[] with escrow bid validation.
 *
 * Mode detection:
 * - If `signPredictorApproval` is provided → session mode (full mint simulation)
 * - Otherwise → EOA mode (lightweight deadline/nonce/balance checks)
 *
 * Deduplication pattern follows useValidatedAuctionBids.ts.
 */
export function useValidatedEscrowBids(
  rawBids: QuoteBid[],
  options: UseValidatedEscrowBidsOptions
): UseValidatedEscrowBidsResult {
  const {
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    predictorAddress,
    predictorCollateral,
    picks,
    isSponsored,
    sponsorAddress,
    signPredictorApproval,
    enabled = true,
  } = options;

  // Track validation results by counterpartySignature
  const [validationResults, setValidationResults] = useState<
    Map<string, SimulateBidResult>
  >(new Map());
  const [isValidating, setIsValidating] = useState(false);

  // Deduplication refs (same pattern as useValidatedAuctionBids)
  const validatingRef = useRef<Set<string>>(new Set());
  const validatedSignaturesRef = useRef<Set<string>>(new Set());

  // Mode detection
  const isSessionMode = !!signPredictorApproval;

  // Can we validate?
  const canValidate = useMemo(() => {
    if (!enabled || !predictionMarketAddress || !collateralTokenAddress)
      return false;
    // Session mode needs predictor info + picks
    if (isSessionMode) {
      return !!predictorAddress && !!predictorCollateral && !!picks && picks.length > 0;
    }
    // EOA mode just needs addresses
    return true;
  }, [
    enabled,
    predictionMarketAddress,
    collateralTokenAddress,
    isSessionMode,
    predictorAddress,
    predictorCollateral,
    picks,
  ]);

  // Invalidate cached results when picks or predictorCollateral changes
  // (predictionHash changes, so all previous simulations are stale)
  const picksKey = useMemo(
    () =>
      picks
        ? picks
            .map(
              (p) =>
                `${p.conditionResolver}:${p.conditionId}:${p.predictedOutcome}`
            )
            .join('|')
        : '',
    [picks]
  );

  useEffect(() => {
    // Clear all cached validation when picks or collateral changes
    validatedSignaturesRef.current.clear();
    validatingRef.current.clear();
    setValidationResults(new Map());
  }, [picksKey, predictorCollateral]);

  // Validate new bids when they arrive
  useEffect(() => {
    if (!canValidate || rawBids.length === 0) return;

    // Find bids not yet validated or in-flight
    const newBids = rawBids.filter((bid) => {
      const sig = bid.counterpartySignature;
      return (
        !validatedSignaturesRef.current.has(sig) &&
        !validatingRef.current.has(sig)
      );
    });

    if (newBids.length === 0) return;

    // Mark as in-flight
    for (const bid of newBids) {
      validatingRef.current.add(bid.counterpartySignature);
    }
    setIsValidating(true);

    let cancelled = false;

    const runValidation = async () => {
      const results = await Promise.all(
        newBids.map(async (bid): Promise<[string, SimulateBidResult]> => {
          try {
            let result: SimulateBidResult;

            if (signPredictorApproval) {
              result = await simulateEscrowBidMint(bid, {
                chainId,
                predictionMarketAddress: predictionMarketAddress!,
                collateralTokenAddress: collateralTokenAddress!,
                predictorAddress: predictorAddress!,
                predictorCollateral: predictorCollateral!,
                picks: picks!,
                predictorSponsor:
                  isSponsored && sponsorAddress ? sponsorAddress : undefined,
                predictorSponsorData:
                  isSponsored && sponsorAddress ? '0x' : undefined,
                signPredictorApproval,
              });
            } else {
              result = await validateEscrowBidLightweight(bid, {
                chainId,
                predictionMarketAddress: predictionMarketAddress!,
                collateralTokenAddress: collateralTokenAddress!,
              });
            }

            return [bid.counterpartySignature, result];
          } catch (err) {
            // Unexpected error — treat as valid
            const errorMsg =
              err instanceof Error ? err.message.slice(0, 100) : 'Unknown';
            logBidValidation(
              `[escrow-validate] Unexpected error for ${bid.counterpartySignature.slice(0, 10)}: ${errorMsg}`
            );
            return [bid.counterpartySignature, { isValid: true }];
          }
        })
      );

      if (cancelled) return;

      setValidationResults((prev) => {
        const updated = new Map(prev);
        for (const [sig, result] of results) {
          updated.set(sig, result);
          validatedSignaturesRef.current.add(sig);
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
    isSessionMode,
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    predictorAddress,
    predictorCollateral,
    picks,
    isSponsored,
    sponsorAddress,
    signPredictorApproval,
  ]);

  // Clean up stale entries (bids no longer in rawBids)
  useEffect(() => {
    const currentSigs = new Set(rawBids.map((b) => b.counterpartySignature));

    for (const sig of validatedSignaturesRef.current) {
      if (!currentSigs.has(sig)) {
        validatedSignaturesRef.current.delete(sig);
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

      const updated = new Map<string, SimulateBidResult>();
      for (const [sig, result] of prev) {
        if (currentSigs.has(sig)) {
          updated.set(sig, result);
        }
      }
      return updated;
    });
  }, [rawBids]);

  // Build validated bids with status
  const validatedBids = useMemo((): QuoteBid[] => {
    return rawBids.map((bid): QuoteBid => {
      // Filter zero address immediately
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
        validationStatus: result.isValid ? 'valid' : 'invalid',
        validationError: result.error,
      };
    });
  }, [rawBids, validationResults, canValidate]);

  // Filter to valid + non-expired bids
  const validBids = useMemo((): QuoteBid[] => {
    const nowMs = Date.now();
    return validatedBids.filter((bid) => {
      if (bid.validationStatus !== 'valid') return false;
      const deadlineSec = Number(bid.counterpartyDeadline || 0);
      if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return false;
      return deadlineSec * 1000 > nowMs;
    });
  }, [validatedBids]);

  const invalidBidCount = useMemo(() => {
    return validatedBids.filter((bid) => bid.validationStatus === 'invalid')
      .length;
  }, [validatedBids]);

  return {
    validatedBids,
    validBids,
    invalidBidCount,
    isValidating,
  };
}
