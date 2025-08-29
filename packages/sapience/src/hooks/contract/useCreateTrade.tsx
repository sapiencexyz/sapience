import type { Hash } from 'viem';
import { parseUnits, type Abi, encodeFunctionData } from 'viem';
import erc20ABI from '@sapience/ui/abis/erc20abi.json';

import { useMemo, useState } from 'react';
import { useTokenApproval } from './useTokenApproval';
import { calculateCollateralLimit } from '~/utils/trade';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

/**
 * Parameters for creating a trader position
 */
export interface CreateTradeParams {
  marketAddress: Hash;
  marketAbi: Abi; // Assuming ABI is passed in
  chainId?: number;
  numericMarketId: number; // Added market ID
  // Market ID might not be needed directly for createTraderPosition, depends on contract
  size: bigint; // Signed size (positive for long, negative for short), already scaled (e.g., 18 decimals)
  collateralAmount: string; // Estimated/max collateral as a string (e.g., "100.5") for display and approval
  slippagePercent: number; // Slippage tolerance as a percentage (e.g., 0.5 for 0.5%)
  enabled?: boolean;
  collateralTokenAddress?: Hash;
  onTxHash?: (txHash: Hash) => void;
  onSuccess?: () => void;
}

/**
 * Result of a trader position creation operation
 */
export interface CreateTradeResult {
  createTrade: () => Promise<void>;
  isLoading: boolean;
  error: Error | null;
}

// Assuming collateral uses 18 decimals
const COLLATERAL_DECIMALS = 18;

// Add a type for potential RPC errors with shortMessage
type PotentialRpcError = Error & { shortMessage?: string };

/**
 * Hook for creating a trader position with automatic token approval and slippage handling
 */
export function useCreateTrade({
  marketAddress,
  marketAbi,
  chainId,
  numericMarketId, // Added market ID
  size,
  collateralAmount, // User facing max collateral (string)
  slippagePercent,
  enabled = true,
  collateralTokenAddress,
  onSuccess,
  onTxHash,
}: CreateTradeParams): CreateTradeResult {
  const [error, setError] = useState<Error | null>(null);

  // Parse collateral amount once
  const parsedCollateralAmount = parseUnits(
    collateralAmount || '0',
    COLLATERAL_DECIMALS
  );

  // Determine if hook should be enabled based on inputs
  const isValidInputs = useMemo(() => {
    return size !== BigInt(0) && parsedCollateralAmount !== BigInt(0);
  }, [size, parsedCollateralAmount]);

  // Combine external enabled flag with input validation
  const isEnabled = enabled && isValidInputs;

  // Use token approval hook to check current allowance
  const { hasAllowance } = useTokenApproval({
    tokenAddress: collateralTokenAddress,
    spenderAddress: marketAddress,
    amount: collateralAmount, // Approve based on the user-facing max collateral amount
    chainId,
    enabled:
      isEnabled &&
      !!collateralTokenAddress &&
      parsedCollateralAmount > BigInt(0),
  });

  // Check if approval is needed
  const needsApproval =
    isEnabled &&
    !hasAllowance &&
    !!collateralTokenAddress &&
    parsedCollateralAmount > BigInt(0);

  const limitCollateral = calculateCollateralLimit(
    parsedCollateralAmount,
    slippagePercent
  );

  // Use the unified write contract wrapper
  const { sendCalls, isPending: isPendingWriteContract } =
    useSapienceWriteContract({
      onError: setError,
      onTxHash: (hash) => {
        onTxHash?.(hash);
      },
      onSuccess,
      successMessage: 'Trade position created successfully',
      fallbackErrorMessage: 'Failed to create trade position',
    });

  // Function to actually create the trader position using sendCalls
  const performCreateTrade = async (): Promise<void> => {
    if (
      !isEnabled ||
      !marketAddress ||
      !chainId ||
      size === BigInt(0) ||
      limitCollateral === BigInt(0) ||
      !collateralTokenAddress
    ) {
      const errorMsg =
        'Missing or invalid parameters for creating trade position';
      console.error('performCreateTrade check failed:', errorMsg);
      setError(new Error(errorMsg));
      throw new Error(errorMsg);
    }

    setError(null); // Clear previous errors

    try {
      // 30 minutes from now
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      // Prepare the parameters for the createTraderPosition function
      const tradeParams = {
        marketId: numericMarketId,
        size,
        maxCollateral: limitCollateral,
        deadline,
      };

      // Build the calls array for sendCalls
      const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

      // Only include approval call if allowance is needed
      if (needsApproval) {
        const approveData = encodeFunctionData({
          abi: erc20ABI,
          functionName: 'approve',
          args: [marketAddress, parsedCollateralAmount],
        });
        calls.push({
          to: collateralTokenAddress,
          data: approveData,
        });
      }

      // Add createTraderPosition call
      const tradeData = encodeFunctionData({
        abi: marketAbi,
        functionName: 'createTraderPosition',
        args: [tradeParams],
      });
      calls.push({
        to: marketAddress,
        data: tradeData,
      });

      // Execute the batch of calls
      await sendCalls({
        calls,
        chainId,
      });
    } catch (err) {
      console.error('Error creating trade position:', err);
      // Refactored nested ternary
      let errorMessage: string;
      if (err instanceof Error && 'shortMessage' in err) {
        errorMessage = (err as PotentialRpcError).shortMessage!;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Failed to submit trade transaction.';
      }

      setError(err instanceof Error ? err : new Error(errorMessage));
      throw err; // Re-throw to be caught by the calling flow controller if needed
    }
  };

  // Main function that handles the trade creation
  const createTrade = async (): Promise<void> => {
    if (!isEnabled) {
      setError(new Error('Trade creation is disabled due to invalid inputs'));
      return;
    }

    setError(null); // Clear previous errors before starting

    try {
      // Execute the trade (approval is included in batch only if needed)
      await performCreateTrade();
    } catch (err) {
      console.error('Error in createTrade flow:', err);
      if (!error) {
        setError(
          err instanceof Error ? err : new Error('An unexpected error occurred')
        );
      }
    }
  };

  return {
    createTrade,
    isLoading: isPendingWriteContract,
    error,
  };
}
