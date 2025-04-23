import { useToast } from '@foil/ui/hooks/use-toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Abi } from 'viem';
import { formatUnits, zeroAddress } from 'viem';
import {
  useAccount,
  useSimulateContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { COLLATERAL_DECIMALS } from '~/lib/constants/numbers';

import { useTokenApproval } from './useTokenApproval';

interface UseModifyTradeProps {
  marketAddress?: `0x${string}`;
  marketAbi?: Abi;
  chainId?: number;
  positionId?: bigint;
  newSize?: bigint; // Renamed from 'size' to 'newSize' for clarity
  slippagePercent?: number;
  enabled?: boolean;
  collateralTokenAddress?: `0x${string}`;
  collateralDecimals?: number;
}

// Explicitly type the expected result from quoteModifyTraderPosition
type QuoteModifyResult = readonly [
  collateralDelta: bigint,
  liquidationPrice: bigint, // Assuming second element is liquidation price (might need adjustment)
  fillPrice: bigint,
];

/**
 * Hook to modify an existing trader position (increase, decrease, or close).
 */
export function useModifyTrade({
  marketAddress,
  marketAbi,
  chainId,
  positionId,
  newSize = BigInt(0), // Default target size to 0 (for closing)
  slippagePercent = 0.5,
  enabled = true,
  collateralTokenAddress,
  collateralDecimals = COLLATERAL_DECIMALS,
}: UseModifyTradeProps) {
  const { toast } = useToast();
  const { address: accountAddress } = useAccount();
  const [internalError, setInternalError] = useState<Error | null>(null);

  // --- 1. Quoting ---
  const isQuoteEnabled = useMemo(
    () =>
      enabled &&
      !!positionId && // Position must exist to modify
      !!marketAddress &&
      !!marketAbi &&
      !!accountAddress &&
      newSize !== undefined, // Ensure newSize is provided
    [enabled, positionId, marketAddress, marketAbi, accountAddress, newSize]
  );

  const {
    data: quoteSimulationResult,
    error: quoteError,
    isFetching: isQuoting,
    refetch: refetchQuote,
  } = useSimulateContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'quoteModifyTraderPosition',
    args: [positionId, newSize], // Use positionId and the target newSize
    chainId,
    account: accountAddress || zeroAddress,
    query: {
      enabled: isQuoteEnabled,
    },
  });

  // Extract quoted values from simulation result
  const [quotedCollateralDelta, quotedFillPrice] = useMemo(() => {
    const result = quoteSimulationResult?.result as
      | QuoteModifyResult
      | undefined;
    if (!result || !Array.isArray(result) || result.length < 3) {
      return [BigInt(0), BigInt(0)];
    }
    // result = [collateralDelta, liquidationPrice, fillPrice]
    return [result[0], result[2]];
  }, [quoteSimulationResult]);

  // --- 2. Collateral Limit Calculation ---
  const collateralDeltaLimit = useMemo(() => {
    // If delta is 0, no limit needed (or possible to calculate)
    if (quotedCollateralDelta === BigInt(0)) return BigInt(0);

    const slippageValue = Number(slippagePercent); // Ensure slippage is a number
    // 10_000 basis points = 100%
    const basisPoints = BigInt(10000);
    // Use Math.max to avoid negative slippage multiplier issues if slippagePercent is negative
    const slippageMultiplier = BigInt(
      Math.floor((100 + Math.max(0, slippageValue)) * 100)
    );
    const slippageReductionMultiplier = BigInt(
      Math.floor((100 - Math.max(0, slippageValue)) * 100)
    );

    // If collateral delta is positive (user pays), limit is higher (allow more)
    if (quotedCollateralDelta > BigInt(0)) {
      return (quotedCollateralDelta * slippageMultiplier) / basisPoints;
    }
    // If collateral delta is negative (user receives), limit is lower (allow less negative -> closer to zero)
    // Note: multiplying a negative delta by the reduction multiplier makes it *less* negative
    return (quotedCollateralDelta * slippageReductionMultiplier) / basisPoints;
  }, [quotedCollateralDelta, slippagePercent]);

  // --- 3. Approval Handling ---
  // Determine the *positive* amount needed for approval (only if delta is positive)
  const amountToApprove = useMemo(() => {
    return quotedCollateralDelta > BigInt(0)
      ? quotedCollateralDelta
      : BigInt(0);
  }, [quotedCollateralDelta]);

  // Format amount for useTokenApproval hook (requires string or undefined)
  const amountToApproveString = useMemo(() => {
    if (amountToApprove === BigInt(0)) return undefined; // Don't approve 0
    // Ensure collateralDecimals is valid before formatting
    const decimals =
      typeof collateralDecimals === 'number' && collateralDecimals >= 0
        ? collateralDecimals
        : COLLATERAL_DECIMALS; // Fallback
    return formatUnits(amountToApprove, decimals);
  }, [amountToApprove, collateralDecimals]);

  const isApprovalHookEnabled = useMemo(
    () =>
      enabled &&
      !!collateralTokenAddress &&
      !!marketAddress &&
      amountToApprove > BigInt(0), // Only enable if approval amount is positive
    [enabled, collateralTokenAddress, marketAddress, amountToApprove]
  );

  const {
    hasAllowance,
    approve,
    isApproving, // Renamed from isLoading
    isApproveSuccess, // Explicitly destructure the intended property
    error: approvalError,
    refetchAllowance,
  } = useTokenApproval({
    tokenAddress: collateralTokenAddress,
    spenderAddress: marketAddress,
    amount: amountToApproveString, // Pass formatted string amount or undefined
    chainId,
    enabled: isApprovalHookEnabled,
    decimals: collateralDecimals, // Pass decimals
  });

  // Determine if approval is *currently* needed based on allowance and required amount
  const needsApproval = useMemo(() => {
    // Only need approval if the hook is enabled (meaning amount > 0) AND allowance is insufficient
    return isApprovalHookEnabled && !hasAllowance;
  }, [isApprovalHookEnabled, hasAllowance]);

  // --- 4. Contract Write (Execution) ---
  const {
    writeContractAsync,
    data: txHash,
    isPending: isWritePending, // Tx submitted, waiting for wallet confirmation
    error: writeError,
    reset: resetWriteContract,
  } = useWriteContract();

  // --- 5. Transaction Confirmation ---
  const {
    isLoading: isConfirming, // Tx mined, waiting for confirmations
    isSuccess: isConfirmed, // Tx confirmed
    error: confirmationError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId,
    query: {
      enabled: !!txHash, // Only watch if there's a hash
    },
  });

  // --- 6. State Management ---
  // Combined loading state
  const isLoading = useMemo(
    () => isQuoting || isApproving || isWritePending || isConfirming,
    [isQuoting, isApproving, isWritePending, isConfirming]
  );

  // Combined error state
  const error = useMemo(
    () =>
      internalError ||
      quoteError ||
      approvalError ||
      writeError ||
      confirmationError,
    [internalError, quoteError, approvalError, writeError, confirmationError]
  );

  // Reset internal error when inputs that affect the operation change
  useEffect(() => {
    setInternalError(null);
  }, [
    marketAddress,
    positionId,
    newSize,
    slippagePercent,
    collateralTokenAddress,
    chainId,
    accountAddress, // Include accountAddress as it affects quote/execution
  ]);

  // --- 7. Modify Trade Execution Function ---
  const validateModificationParams = useCallback(() => {
    if (!enabled) {
      return new Error('Hook is not enabled.');
    }
    if (!accountAddress) {
      toast({
        title: 'Wallet Error',
        description: 'Please connect your wallet.',
        variant: 'destructive',
      });
      return new Error('Wallet not connected.');
    }
    if (
      !marketAddress ||
      !marketAbi ||
      !chainId ||
      positionId === undefined ||
      newSize === undefined
    ) {
      toast({
        title: 'Configuration Error',
        description: 'Missing required parameters for modification.',
        variant: 'destructive',
      });
      return new Error('Missing required market, position, or size details.');
    }
    if (isQuoting) {
      return new Error('Still fetching quote. Please wait.');
    }
    if (!quoteSimulationResult && isQuoteEnabled) {
      toast({
        title: 'Quote Error',
        description: 'Could not retrieve quote data.',
        variant: 'destructive',
      });
      return new Error(
        'Quote data is not available. Please try refreshing the quote.'
      );
    }
    if (quoteError) {
      toast({
        title: 'Quote Failed',
        description: quoteError.message,
        variant: 'destructive',
      });
      return new Error(`Quote error: ${quoteError.message}`);
    }
    if (
      quotedCollateralDelta !== BigInt(0) &&
      collateralDeltaLimit === BigInt(0) &&
      slippagePercent > 0
    ) {
      console.warn(
        'Calculated collateralDeltaLimit is zero despite non-zero delta and slippage.',
        { quotedCollateralDelta, slippagePercent }
      );
      toast({
        title: 'Slippage Error',
        description: 'Could not calculate slippage limit.',
        variant: 'destructive',
      });
      return new Error(
        'Slippage calculation resulted in zero limit. Check slippage value.'
      );
    }
    return null;
  }, [
    enabled,
    accountAddress,
    marketAddress,
    marketAbi,
    chainId,
    positionId,
    newSize,
    isQuoting,
    quoteSimulationResult,
    isQuoteEnabled,
    quoteError,
    quotedCollateralDelta,
    collateralDeltaLimit,
    slippagePercent,
    toast,
  ]);

  const handleApproval = useCallback(async () => {
    if (!approve) {
      toast({
        title: 'Approval Error',
        description: 'Cannot initiate approval.',
        variant: 'destructive',
      });
      return new Error('Approval function is not available.');
    }

    if (amountToApprove <= BigInt(0)) {
      toast({
        title: 'Approval Error',
        description: 'Invalid approval amount.',
        variant: 'destructive',
      });
      return new Error('Approval needed but amount is zero or negative.');
    }

    toast({
      title: 'Approval Required',
      description: 'Please approve the token spending in your wallet.',
    });

    await approve();

    toast({
      title: 'Approval Sent',
      description: 'Waiting for approval confirmation before proceeding.',
    });

    return null;
  }, [approve, amountToApprove, toast]);

  const modifyTrade = useCallback(async () => {
    setInternalError(null);
    resetWriteContract();

    // Step 1: Validate parameters
    const validationError = validateModificationParams();
    if (validationError) {
      setInternalError(validationError);
      return;
    }

    // Type guard - these should never be undefined after validation
    if (!marketAddress || !marketAbi) return;

    try {
      // Step 2: Handle Approval if needed
      if (needsApproval) {
        const approvalError = await handleApproval();
        if (approvalError) {
          setInternalError(approvalError);
          return;
        }
        return; // Stop execution here, wait for user to click again after approval
      }

      // Re-check allowance
      if (isApprovalHookEnabled && !hasAllowance) {
        toast({
          title: 'Approval Required',
          description: 'Allowance is still insufficient.',
          variant: 'destructive',
        });
        setInternalError(
          new Error('Token allowance is insufficient. Please approve first.')
        );
        return;
      }

      // Step 3: Execute position modification
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 minutes deadline
      const actionText = newSize === BigInt(0) ? 'Closing' : 'Modifying';

      toast({
        title: `${actionText} Position`,
        description: 'Please confirm the transaction in your wallet.',
      });

      await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'modifyTraderPosition',
        args: [positionId, newSize, collateralDeltaLimit, deadline],
        chainId,
      });
    } catch (err: any) {
      console.error('Modify Trade Error:', err);
      const message =
        err.shortMessage ||
        err.message ||
        'An unknown error occurred during modification.';

      if (!writeError && !confirmationError && !approvalError && !quoteError) {
        setInternalError(new Error(message));
      }

      toast({
        title: 'Modification Failed',
        description: message,
        variant: 'destructive',
      });
      resetWriteContract();
    }
  }, [
    validateModificationParams,
    handleApproval,
    needsApproval,
    isApprovalHookEnabled,
    hasAllowance,
    marketAddress,
    marketAbi,
    positionId,
    newSize,
    collateralDeltaLimit,
    chainId,
    writeContractAsync,
    toast,
    resetWriteContract,
    writeError,
    confirmationError,
    approvalError,
    quoteError,
    setInternalError,
  ]);

  return {
    // Core function
    modifyTrade,

    // Quote results
    quotedCollateralDelta,
    quotedFillPrice,
    collateralDeltaLimit, // Expose calculated limit

    // Approval state
    needsApproval,
    hasAllowance,
    isApproving, // Approval transaction pending
    isApproveSuccess, // Approval transaction confirmed

    // Modification transaction state
    isModifying: isWritePending, // Write tx submitted to wallet
    isConfirming, // Write tx confirming on-chain
    isSuccess: isConfirmed, // Write tx confirmed successfully
    txHash, // Hash of the modification transaction

    // Combined states
    isLoading, // True if any async operation is in progress
    isError: !!error,
    error, // Combined error object

    // Refetch functions
    refetchQuote,
    refetchAllowance,
  };
}
