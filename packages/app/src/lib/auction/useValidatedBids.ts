'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { erc20Abi } from 'viem';

import type { QuoteBid } from '~/lib/auction/useAuctionStart';
import { getPublicClientForChainId } from '~/lib/utils/util';

interface ValidationCheckResult {
  makerHasSufficientAllowance: boolean;
  makerHasSufficientBalance: boolean;
  userHasSufficientAllowance: boolean;
  userHasSufficientBalance: boolean;
}

/**
 * Returns an error message if any validation check fails, undefined if all pass.
 */
function getValidationErrorMessage(
  checks: ValidationCheckResult
): string | undefined {
  if (!checks.makerHasSufficientAllowance) {
    return 'Market maker has insufficient allowance';
  }
  if (!checks.makerHasSufficientBalance) {
    return 'Market maker has insufficient balance';
  }
  if (!checks.userHasSufficientAllowance) {
    return 'Insufficient allowance for your wager';
  }
  if (!checks.userHasSufficientBalance) {
    return 'Insufficient balance for your wager';
  }
  return undefined;
}

interface UseValidatedBidsParams {
  bids: QuoteBid[];
  chainId: number;
  collateralTokenAddress?: `0x${string}`;
  predictionMarketAddress?: `0x${string}`;
  /** User's address (auction creator / contract maker) for balance validation */
  userAddress?: `0x${string}`;
  /** User's wager amount in wei for balance validation */
  userWagerWei?: string;
  /** Whether user is on Ethereal chain (uses native balance, skip ERC20 allowance check) */
  isEtherealChain?: boolean;
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
  userAddress,
  userWagerWei,
  isEtherealChain = false,
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

          // Include user address and wager in cache key to revalidate when they change
          const cacheKey = `${bid.maker}-${bid.makerWager}-${userAddress || ''}-${userWagerWei || ''}-${chainId}`;

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
            // Market maker validation (bid.maker = contract taker)
            const makerAddress = bid.maker as `0x${string}`;
            const makerCollateralRequired = BigInt(bid.makerWager);

            // Build validation calls for market maker
            const validationCalls: Promise<bigint>[] = [
              publicClient.readContract({
                address: collateralTokenAddress,
                abi: erc20Abi,
                functionName: 'allowance',
                args: [makerAddress, predictionMarketAddress],
              }),
              publicClient.readContract({
                address: collateralTokenAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [makerAddress],
              }),
            ];

            // Add user validation if user address and wager provided (non-Ethereal only for allowance)
            const userWager = userWagerWei ? BigInt(userWagerWei) : 0n;
            const shouldValidateUser = userAddress && userWager > 0n;

            if (shouldValidateUser && !isEtherealChain) {
              // On non-Ethereal chains, check user's ERC20 allowance
              validationCalls.push(
                publicClient.readContract({
                  address: collateralTokenAddress,
                  abi: erc20Abi,
                  functionName: 'allowance',
                  args: [userAddress, predictionMarketAddress],
                })
              );
              validationCalls.push(
                publicClient.readContract({
                  address: collateralTokenAddress,
                  abi: erc20Abi,
                  functionName: 'balanceOf',
                  args: [userAddress],
                })
              );
            } else if (shouldValidateUser && isEtherealChain) {
              // On Ethereal, only check balance (native USDe doesn't need ERC20 approval)
              validationCalls.push(
                publicClient.getBalance({ address: userAddress })
              );
            }

            const results = await Promise.all(validationCalls);
            const [makerAllowance, makerBalance] = results;

            // Validate market maker
            const makerHasSufficientAllowance =
              makerAllowance >= makerCollateralRequired;
            const makerHasSufficientBalance =
              makerBalance >= makerCollateralRequired;

            // Validate user (if applicable)
            let userHasSufficientAllowance = true;
            let userHasSufficientBalance = true;

            if (shouldValidateUser) {
              if (isEtherealChain) {
                // Ethereal: only balance check (index 2 is native balance)
                const userBalance = results[2] ?? 0n;
                userHasSufficientBalance = userBalance >= userWager;
              } else {
                // Non-Ethereal: allowance (index 2) and balance (index 3)
                const userAllowance = results[2] ?? 0n;
                const userBalance = results[3] ?? 0n;
                userHasSufficientAllowance = userAllowance >= userWager;
                userHasSufficientBalance = userBalance >= userWager;
              }
            }

            // Determine validation result and error message
            const errorMessage = getValidationErrorMessage({
              makerHasSufficientAllowance,
              makerHasSufficientBalance,
              userHasSufficientAllowance,
              userHasSufficientBalance,
            });

            const isValid = errorMessage === undefined;

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
    userAddress,
    userWagerWei,
    isEtherealChain,
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
