'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { erc20Abi } from 'viem';
import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { getPublicClientForChainId } from '~/lib/utils/util';

interface UseValidatedBidsParams {
  bids: QuoteBid[];
  chainId: number;
  collateralTokenAddress?: `0x${string}`;
  predictionMarketAddress?: `0x${string}`;
  enabled?: boolean;
}

/**
 * Hook that validates bids by checking bidder (taker) allowance and balance on-chain.
 *
 * This prevents showing bids from market makers who don't have sufficient funds
 * to fulfill the trade, avoiding the 0x13be252b (InsufficientAllowance) error.
 */
export function useValidatedBids({
  bids,
  chainId,
  collateralTokenAddress,
  predictionMarketAddress,
  enabled = true,
}: UseValidatedBidsParams): QuoteBid[] {
  const [validatedBids, setValidatedBids] = useState<QuoteBid[]>([]);
  const validationCacheRef = useRef<
    Map<string, { valid: boolean; error?: string }>
  >(new Map());
  const pendingValidationsRef = useRef<Set<string>>(new Set());

  // Memoized public client for third-party validation (market maker checks)
  const publicClient = useMemo(
    () => getPublicClientForChainId(chainId),
    [chainId]
  );

  useEffect(() => {
    // Track whether this effect has been superseded by a newer one
    let cancelled = false;

    if (!enabled || !collateralTokenAddress || !predictionMarketAddress) {
      // Pass through bids as-is if validation is disabled or missing config
      setValidatedBids(bids);
      return;
    }

    if (bids.length === 0) {
      setValidatedBids([]);
      return;
    }

    const validateBidsAsync = async () => {
      const results: QuoteBid[] = await Promise.all(
        bids.map(async (bid) => {
          // Skip if already marked as invalid from basic validation
          if (bid.validationStatus === 'invalid') {
            return bid;
          }

          const cacheKey = `${bid.maker}-${bid.makerWager}-${chainId}`;

          // Check cache first
          const cached = validationCacheRef.current.get(cacheKey);
          if (cached !== undefined) {
            return {
              ...bid,
              validationStatus: cached.valid
                ? ('valid' as const)
                : ('invalid' as const),
              validationError: cached.error,
            };
          }

          // Skip if already being validated
          if (pendingValidationsRef.current.has(cacheKey)) {
            return {
              ...bid,
              validationStatus: 'pending' as const,
            };
          }

          pendingValidationsRef.current.add(cacheKey);

          try {
            const takerAddress = bid.maker as `0x${string}`; // In our system, bid.maker is the contract taker
            const takerCollateralRequired = BigInt(bid.makerWager);

            const [takerAllowance, takerBalance] = await Promise.all([
              publicClient.readContract({
                address: collateralTokenAddress,
                abi: erc20Abi,
                functionName: 'allowance',
                args: [takerAddress, predictionMarketAddress],
              }),
              publicClient.readContract({
                address: collateralTokenAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [takerAddress],
              }),
            ]);

            const hasSufficientAllowance =
              takerAllowance >= takerCollateralRequired;
            const hasSufficientBalance =
              takerBalance >= takerCollateralRequired;
            const isValid = hasSufficientAllowance && hasSufficientBalance;

            let errorMessage: string | undefined;
            if (!hasSufficientAllowance) {
              errorMessage = 'Market maker has insufficient allowance';
            } else if (!hasSufficientBalance) {
              errorMessage = 'Market maker has insufficient balance';
            }

            // Cache the result
            validationCacheRef.current.set(cacheKey, {
              valid: isValid,
              error: errorMessage,
            });
            pendingValidationsRef.current.delete(cacheKey);

            return {
              ...bid,
              validationStatus: isValid
                ? ('valid' as const)
                : ('invalid' as const),
              validationError: errorMessage,
            };
          } catch {
            pendingValidationsRef.current.delete(cacheKey);
            // On RPC error, mark as pending (don't reject bid due to RPC issues)
            return {
              ...bid,
              validationStatus: 'pending' as const,
              validationError: 'Validation pending',
            };
          }
        })
      );

      // Only update state if this effect hasn't been superseded
      if (!cancelled) {
        setValidatedBids(results);
      }
    };

    validateBidsAsync();

    // Cleanup: mark this effect as stale if dependencies change
    return () => {
      cancelled = true;
    };
  }, [
    bids,
    chainId,
    collateralTokenAddress,
    predictionMarketAddress,
    enabled,
    publicClient,
  ]);

  // Clear cache when chain or contract addresses change
  useEffect(() => {
    validationCacheRef.current.clear();
    pendingValidationsRef.current.clear();
  }, [chainId, collateralTokenAddress, predictionMarketAddress]);

  return validatedBids;
}
