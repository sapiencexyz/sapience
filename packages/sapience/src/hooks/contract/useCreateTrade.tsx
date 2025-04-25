import { useToast } from '@foil/ui/hooks/use-toast';
import { useEffect, useMemo, useState } from 'react';
import { parseUnits, type Abi } from 'viem';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { useTokenApproval } from './useTokenApproval';

/**
 * Parameters for creating a trader position
 */
export interface CreateTradeParams {
  marketAddress: `0x${string}`;
  marketAbi: Abi; // Assuming ABI is passed in
  chainId?: number;
  numericMarketId: number; // Added market ID
  // Market ID might not be needed directly for createTraderPosition, depends on contract
  size: bigint; // Signed size (positive for long, negative for short), already scaled (e.g., 18 decimals)
  collateralAmount: string; // Estimated/max collateral as a string (e.g., "100.5") for display and approval
  slippagePercent: number; // Slippage tolerance as a percentage (e.g., 0.5 for 0.5%)
  enabled?: boolean;
  collateralTokenAddress?: `0x${string}`;
}

/**
 * Result of a trader position creation operation
 */
export interface CreateTradeResult {
  createTrade: () => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
  data?: any; // Result from useWriteContract
  isApproving: boolean;
  hasAllowance: boolean;
  needsApproval: boolean;
}

// Assuming collateral uses 18 decimals
const COLLATERAL_DECIMALS = 18;

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
}: CreateTradeParams): CreateTradeResult {
  const { toast } = useToast();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);

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

  // Use token approval hook
  const {
    hasAllowance,
    isApproving,
    isApproveSuccess,
    approve,
    error: approvalError,
  } = useTokenApproval({
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
    collateralTokenAddress !== undefined &&
    parsedCollateralAmount > BigInt(0);

  // Calculate collateral limit including slippage
  // limitCollateral = maxCollateral * (1 + slippagePercent / 100)
  const calculateCollateralLimit = (
    amount: bigint,
    slippage: number
  ): bigint => {
    if (amount === BigInt(0)) return BigInt(0);
    // Use BigInt math to avoid floating point issues
    // Multiply slippage by 100 to get basis points, add to 10000 (100%)
    const slippageFactor = BigInt(10000 + Math.floor(slippage * 100));
    // Calculate limit = amount * (10000 + slippageBasisPoints) / 10000
    return (amount * slippageFactor) / BigInt(10000);
  };

  const limitCollateral = calculateCollateralLimit(
    parsedCollateralAmount,
    slippagePercent
  );

  // Write contract hook for creating the trader position
  const {
    writeContractAsync,
    isPending: isWritePending, // Renamed to avoid clash
    data,
    error: writeError,
  } = useWriteContract();

  // Watch for transaction completion
  const {
    isLoading: isConfirming,
    isSuccess,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    chainId, // Pass chainId for potentially faster confirmation lookup
  });

  // Set error if any occur during the process
  useEffect(() => {
    setError(null); // Clear previous errors on new potential error
    if (writeError) setError(writeError);
    if (txError) setError(txError);
    if (approvalError) setError(approvalError);
  }, [writeError, txError, approvalError]);

  // When approval is successful, proceed with creating the trade
  useEffect(() => {
    const handleApprovalSuccess = async () => {
      if (!isEnabled || !processingTx || !isApproveSuccess) return;

      toast({
        title: 'Token Approved',
        description: 'Proceeding to open trade...',
      });

      try {
        await performCreateTrade();
        // Keep processingTx true until tx is confirmed or fails
      } catch (err) {
        setProcessingTx(false); // Stop processing if performCreateTrade fails immediately
        console.error('Error creating trade after approval:', err);
        setError(
          err instanceof Error
            ? err
            : new Error('Failed to create trade after approval')
        );
        toast({
          title: 'Error',
          description:
            'Failed to create trade after approval. Please try again.',
          variant: 'destructive',
        });
      }
    };

    handleApprovalSuccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isApproveSuccess, processingTx, isEnabled]); // Dependencies carefully chosen

  // Function to actually create the trader position
  const performCreateTrade = async (): Promise<void> => {
    if (
      !isEnabled ||
      !marketAddress ||
      size === BigInt(0) ||
      limitCollateral === BigInt(0)
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

      console.log('Calling createTraderPosition with:', {
        marketAddress,
        numericMarketId, // Log market ID
        size: size.toString(), // Log as string for readability
        limitCollateral: limitCollateral.toString(), // Log as string
        deadline: deadline.toString(),
      });

      // Call the contract function
      const hash = await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'createTraderPosition',
        chainId,
        // Pass arguments as a flat array based on expected signature
        args: [numericMarketId, size, limitCollateral, deadline],
        // Consider adding gas estimation or manual limit if needed
      });

      setTxHash(hash);

      toast({
        title: 'Transaction Submitted',
        description: 'Your trade transaction has been submitted.',
      });
    } catch (err: any) {
      console.error('Error creating trade position:', err);
      const errorMessage =
        err?.shortMessage ||
        err?.message ||
        'Failed to submit trade transaction.';
      setError(err instanceof Error ? err : new Error(errorMessage));
      toast({
        title: 'Transaction Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err; // Re-throw to be caught by the calling flow controller if needed
    }
  };

  // Main function that checks approval and handles the flow
  const createTrade = async (): Promise<void> => {
    if (!isEnabled) {
      setError(new Error('Trade creation is disabled due to invalid inputs'));
      return;
    }

    setProcessingTx(true);
    setError(null); // Clear previous errors before starting

    try {
      // First check if we need approval
      if (needsApproval) {
        toast({
          title: 'Approval Required',
          description: `Approving ${collateralAmount} tokens...`, // Be more specific
        });
        await approve(); // Call approve from useTokenApproval
        // The trade creation will be triggered by the useEffect watching isApproveSuccess
      } else {
        // If we already have allowance, create trade directly
        await performCreateTrade();
      }
    } catch (err) {
      // Errors during approve() or performCreateTrade() called directly
      setProcessingTx(false); // Stop processing on error
      console.error('Error in createTrade flow:', err);
      // Error toast is likely handled within approve() or performCreateTrade()
      // If not, add a generic one here. Let's rely on specific handlers for now.
      if (!error) {
        // Set error state if not already set by specific handlers
        setError(
          err instanceof Error ? err : new Error('An unexpected error occurred')
        );
      }
    }
  };

  // Reset processing state on final success or error
  useEffect(() => {
    // Only update state if it needs changing
    if ((isSuccess || error) && processingTx) {
      setProcessingTx(false);
    }
    // Keep dependencies simple: effect checks internal state (processingTx)
  }, [isSuccess, error, processingTx]);

  const isLoading =
    isWritePending || isConfirming || processingTx || isApproving;
  const isError = !!error;

  return {
    createTrade,
    isLoading,
    isSuccess,
    isError,
    error,
    txHash,
    data, // raw data from writeContractAsync result
    isApproving,
    hasAllowance,
    needsApproval,
  };
}
