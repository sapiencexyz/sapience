'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { zeroAddress as ZERO_ADDRESS, type Address } from 'viem';
import type { Pick, PickJson } from '@sapience/sdk/types';
import type { ValidationResult } from '@sapience/sdk/auction/validation';
import { validateBidOnChain } from '@sapience/sdk/auction/validation';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { effectiveDeadlineMs } from '~/lib/auction/bidExpiry';
import { useSecondTick } from '~/hooks/useSecondTick';
import { logBidValidation, formatBidForLog } from '~/lib/auction/bidLogger';
import { PREFERRED_ESTIMATE_QUOTER } from '~/lib/constants';
import { getPublicClientForChainId } from '~/lib/utils/util';

export type ValidationStatus = 'pending' | 'valid' | 'invalid';

export interface UseValidatedBidsOptions {
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

export interface UseValidatedBidsResult {
  validatedBids: QuoteBid[];
  validBids: QuoteBid[];
  invalidBidCount: number;
  isValidating: boolean;
}

/**
 * Hook that wraps raw QuoteBid[] with on-chain bid validation.
 *
 * Uses unified Tier 2 validation via `validateBidOnChain` from the SDK,
 * which calls `verifyMintPartySignature()` on-chain for definitive signature
 * verification plus nonce/balance/allowance checks. No session/EOA
 * bifurcation — all signature types are handled by the contract view.
 *
 * Fail-closed: RPC errors and unexpected exceptions mark bids as invalid
 * rather than allowing unverified bids through. This prevents unfunded
 * bid griefing where a spoofed high bid could displace legitimate bids.
 */
export function useValidatedBids(
  rawBids: QuoteBid[],
  options: UseValidatedBidsOptions
): UseValidatedBidsResult {
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

  // Deduplication refs
  const validatingRef = useRef<Set<string>>(new Set());
  const validatedSignaturesRef = useRef<Set<string>>(new Set());

  // Input fingerprint: a validation in flight is only safe to commit if the
  // validation context (every input flowing into validateBidOnChain) still
  // matches the snapshot taken when validation started. The ref is updated
  // synchronously during render (below, after validationContextKey is
  // computed) so an in-flight validation that resolves between a render
  // with a new context and the cleanup effect still sees the latest key
  // and drops itself as stale.
  const inputFingerprintRef = useRef<string>('');

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

  // Single source of truth for "what is `validateBidOnChain` going to hash
  // against?" — every input that flows into the on-chain digest must be in
  // here. Used both to invalidate the cache when context changes and to
  // detect in-flight results that completed against an obsolete context.
  // Sponsor address is only included when isSponsored is true, mirroring
  // how `runValidation` passes it (undefined otherwise).
  const validationContextKey = useMemo(
    () =>
      [
        picksKey,
        predictorAddress?.toLowerCase() ?? '',
        predictorCollateral ?? '',
        predictorNonce ?? '',
        isSponsored ? (sponsorAddress?.toLowerCase() ?? '') : '',
        String(chainId),
        predictionMarketAddress?.toLowerCase() ?? '',
        collateralTokenAddress?.toLowerCase() ?? '',
      ].join('::'),
    [
      picksKey,
      predictorAddress,
      predictorCollateral,
      predictorNonce,
      isSponsored,
      sponsorAddress,
      chainId,
      predictionMarketAddress,
      collateralTokenAddress,
    ]
  );

  // Track the latest validation context synchronously during render. An
  // in-flight validation that resolves between a render with a new context
  // and the cleanup useEffect below would otherwise read a stale ref and
  // commit under the wrong context. Mutating a ref during render is the
  // standard React pattern for "always-current value visible to async
  // closures" and is idempotent under concurrent rendering.
  inputFingerprintRef.current = validationContextKey;

  useEffect(() => {
    // Invalidate cached results when any input that affects the on-chain
    // validation digest changes. The fingerprint ref is updated above
    // during render — this effect only handles the state-mutating side of
    // the cleanup (clearing the maps).
    validatedSignaturesRef.current.clear();
    validatingRef.current.clear();
    setValidationResults(new Map());
  }, [validationContextKey]);

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

    logBidValidation(
      `Validating ${newBids.length} new bid(s):`,
      newBids.map((b) => formatBidForLog(b))
    );

    // Mark as in-flight
    for (const bid of newBids) {
      validatingRef.current.add(bid.counterpartySignature);
    }
    setIsValidating(true);

    // Snapshot the validation context at start. If `validationContextKey`
    // changes before commit (any input that flows into the on-chain digest:
    // picks, predictor, collateral, nonce, sponsor, chain, escrow, token),
    // the result is stale and must be dropped.
    const startFingerprint = validationContextKey;

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
                  failOpen: false,
                }
              );

              logBidValidation(
                `Result for ${bid.counterparty?.slice(0, 10)}:`,
                result.status,
                result.status !== 'valid'
                  ? `code=${'code' in result ? result.code : 'n/a'} reason=${'reason' in result ? result.reason : 'n/a'}`
                  : ''
              );

              return [
                bid.counterpartySignature,
                {
                  isValid:
                    result.status === 'valid' || result.status === 'unverified',
                  error:
                    result.status === 'invalid' ? result.reason : undefined,
                },
              ];
            } catch (err) {
              // Fail-closed: treat unexpected errors as invalid to prevent
              // unfunded bid griefing (spoofed high bids displacing real ones).
              const errorMsg =
                err instanceof Error ? err.message.slice(0, 100) : 'Unknown';
              logBidValidation(
                `[validate] Unexpected error for ${bid.counterpartySignature.slice(0, 10)}: ${errorMsg}`
              );
              return [
                bid.counterpartySignature,
                { isValid: false, error: errorMsg },
              ];
            }
          }
        )
      );

      // Drop stale results: if prediction inputs changed during the
      // request, the validation hashed against an obsolete predictor
      // snapshot and committing would poison the cache. validatingRef is
      // cleared by the input-change effect, so no need to clean it here.
      if (inputFingerprintRef.current !== startFingerprint) {
        setIsValidating(validatingRef.current.size > 0);
        return;
      }

      // Commit: results are sig-keyed and idempotent. Stale entries (sigs
      // no longer in rawBids) are pruned by the cleanup effect below; this
      // commit path also runs after a same-input rerender (relayer
      // rebroadcast of the same bid), so we must NOT discard purely on the
      // basis of effect re-run.
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
    // Listed individually so the lint rule is satisfied for each closure
    // read; validationContextKey duplicates the same trigger set as a single
    // string used for stale-result detection in `runValidation`.
  }, [
    rawBids,
    canValidate,
    chainId,
    predictionMarketAddress,
    collateralTokenAddress,
    predictorAddress,
    predictorCollateral,
    predictorNonce,
    picksJson,
    isSponsored,
    sponsorAddress,
    validationContextKey,
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
  // Tick once per second so a bid drops out when its (buffered) deadline
  // elapses even if no new bids arrive.
  const tickedNowMs = useSecondTick();
  const validBids = useMemo((): QuoteBid[] => {
    const nowMs = tickedNowMs ?? Date.now();
    return validatedBids.filter((bid) => {
      if (bid.validationStatus !== 'valid') return false;
      const deadlineSec = Number(bid.counterpartyDeadline || 0);
      if (!Number.isFinite(deadlineSec) || deadlineSec <= 0) return false;
      return effectiveDeadlineMs(deadlineSec) > nowMs;
    });
  }, [validatedBids, tickedNowMs]);

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
