'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import type { Pick, PickJson } from '@sapience/sdk/types';
import type { ValidationResult } from '@sapience/sdk/auction/validation';
import { validateBidOnChain } from '@sapience/sdk/auction/validation';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { logBidValidation } from '~/lib/auction/bidLogger';
import { PREFERRED_ESTIMATE_QUOTER } from '@sapience/sdk/constants';
import { getPublicClientForChainId } from '~/lib/utils/util';

export type ValidationStatus = 'pending' | 'valid' | 'invalid';

export interface UseValidatedEscrowBidsOptions {
  chainId: number;
  predictionMarketAddress?: Address;
  collateralTokenAddress?: Address;
  predictorAddress?: Address;
  predictorCollateral?: string; // wei
  predictorNonce?: number;
  picks?: Pick[];
  isSponsored?: boolean;
  sponsorAddress?: Address;
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
 * Uses unified Tier 2 validation via `validateBidOnChain` from the SDK,
 * which calls `verifyMintPartySignature()` on-chain for definitive signature
 * verification plus nonce/balance/allowance checks. No session/EOA
 * bifurcation — all signature types are handled by the contract view.
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
    predictorNonce,
    picks,
    isSponsored,
    sponsorAddress,
    enabled = true,
  } = options;

  // Track validation results by counterpartySignature
  const [validationResults, setValidationResults] = useState<
    Map<string, { isValid: boolean; error?: string }>
  >(new Map());
  const [isValidating, setIsValidating] = useState(false);

  // Deduplication refs (same pattern as useValidatedAuctionBids)
  const validatingRef = useRef<Set<string>>(new Set());
  const validatedSignaturesRef = useRef<Set<string>>(new Set());

  // Can we validate?
  const canValidate = useMemo(() => {
    if (!enabled || !predictionMarketAddress || !collateralTokenAddress)
      return false;
    // Need predictor info + picks for predictionHash computation
    return (
      !!predictorAddress &&
      predictorAddress.toLowerCase() !== ZERO_ADDRESS &&
      !!predictorCollateral &&
      !!picks &&
      picks.length > 0
    );
  }, [
    enabled,
    predictionMarketAddress,
    collateralTokenAddress,
    predictorAddress,
    predictorCollateral,
    picks,
  ]);

  // Convert picks to PickJson for SDK validation
  const picksJson: PickJson[] | undefined = useMemo(
    () =>
      picks?.map((p) => ({
        conditionResolver: p.conditionResolver,
        conditionId: p.conditionId,
        predictedOutcome: p.predictedOutcome,
      })),
    [picks]
  );

  // Invalidate cached results when picks or predictorCollateral changes
  // (predictionHash changes, so all previous validations are stale)
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

    // Find bids not yet validated or in-flight (skip estimator — deadline=1, never executable)
    const newBids = rawBids.filter((bid) => {
      const sig = bid.counterpartySignature;
      if (
        bid.counterparty?.toLowerCase() ===
        PREFERRED_ESTIMATE_QUOTER.toLowerCase()
      ) {
        return false;
      }
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const publicClient = getPublicClientForChainId(chainId) as any;
      const results = await Promise.all(
        newBids.map(
          async (
            bid
          ): Promise<[string, { isValid: boolean; error?: string }]> => {
            try {
              const result: ValidationResult = await validateBidOnChain(
                {
                  counterparty: bid.counterparty,
                  counterpartyCollateral: bid.counterpartyCollateral,
                  counterpartyNonce: bid.counterpartyNonce,
                  counterpartyDeadline: bid.counterpartyDeadline,
                  counterpartySignature: bid.counterpartySignature,
                  counterpartySessionKeyData: bid.counterpartySessionKeyData,
                },
                {
                  predictor: predictorAddress!,
                  predictorCollateral: predictorCollateral!,
                  predictorNonce,
                  picks: picksJson!,
                  predictorSponsor:
                    isSponsored && sponsorAddress ? sponsorAddress : undefined,
                  predictorSponsorData:
                    isSponsored && sponsorAddress ? '0x' : undefined,
                },
                {
                  chainId,
                  predictionMarketAddress: predictionMarketAddress!,
                  collateralTokenAddress: collateralTokenAddress!,
                  publicClient,
                }
              );

              return [
                bid.counterpartySignature,
                {
                  isValid: result.status === 'valid',
                  error:
                    result.status === 'invalid' ? result.reason : undefined,
                },
              ];
            } catch (err) {
              // Unexpected error — treat as valid (fail-open)
              const errorMsg =
                err instanceof Error ? err.message.slice(0, 100) : 'Unknown';
              logBidValidation(
                `[escrow-validate] Unexpected error for ${bid.counterpartySignature.slice(0, 10)}: ${errorMsg}`
              );
              return [bid.counterpartySignature, { isValid: true }];
            }
          }
        )
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
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    predictorAddress,
    predictorCollateral,
    picksJson,
    isSponsored,
    sponsorAddress,
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

      const updated = new Map<string, { isValid: boolean; error?: string }>();
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
      // Skip validation for estimator bids — they use deadline=1 (non-executable, display only)
      if (
        bid.counterparty?.toLowerCase() ===
        PREFERRED_ESTIMATE_QUOTER.toLowerCase()
      ) {
        return {
          ...bid,
          validationStatus: 'valid' as const,
        };
      }

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
