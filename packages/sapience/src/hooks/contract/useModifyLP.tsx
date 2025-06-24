import { useToast } from '@sapience/ui/hooks/use-toast';
import { useEffect, useState, useCallback } from 'react';
import type { Abi } from 'viem';
import { parseUnits } from 'viem';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { useTokenApproval } from './useTokenApproval';

/**
 * Parameters for modifying a liquidity position
 */
export interface ModifyLPParams {
  marketAddress: `0x${string}`;
  marketAbi: Abi;
  chainId?: number;
  positionId: string;
  mode: 'add' | 'remove'; // Whether to add or remove liquidity
  liquidityDelta: bigint; // Liquidity delta from quoter
  amount0: bigint; // Token0 delta amount
  amount1: bigint; // Token1 delta amount
  collateralDelta: string; // Collateral delta amount (additional collateral for add mode)
  slippagePercent: number;
  enabled?: boolean;
  collateralTokenAddress?: `0x${string}`;
}

/**
 * Result of a liquidity position modification operation
 */
export interface ModifyLPResult {
  modifyLP: () => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
  data?: `0x${string}` | undefined;
  isApproving: boolean;
  hasAllowance: boolean;
  needsApproval: boolean;
}

/**
 * Hook for modifying (adding or removing) liquidity from an existing position
 */
export function useModifyLP({
  marketAddress,
  marketAbi,
  chainId,
  positionId,
  mode,
  liquidityDelta,
  amount0,
  amount1,
  collateralDelta,
  slippagePercent,
  enabled = true,
  collateralTokenAddress,
}: ModifyLPParams): ModifyLPResult {
  const { toast } = useToast();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);

  // Only need approval when adding liquidity
  const isAddMode = mode === 'add';
  const needsApprovalCheck =
    isAddMode &&
    !!collateralTokenAddress &&
    parseFloat(collateralDelta || '0') > 0;

  // Use token approval hook for when adding liquidity (using the delta amount)
  const {
    hasAllowance,
    isApproving,
    isApproveSuccess,
    approve,
    error: approvalError,
  } = useTokenApproval({
    tokenAddress: collateralTokenAddress,
    spenderAddress: marketAddress,
    amount: collateralDelta,
    chainId,
    enabled: enabled && needsApprovalCheck,
  });

  // Check if approval is needed
  const needsApproval = needsApprovalCheck && !hasAllowance;

  // Parse collateral delta amount
  const parsedCollateralDelta = parseUnits(collateralDelta || '0', 18);

  // Calculate min amounts based on slippage percentage
  const calculateMinAmount = (amount: bigint, slippage: number): bigint => {
    if (amount === BigInt(0)) return BigInt(0);
    const slippageBasisPoints = BigInt(Math.floor(slippage * 100));
    return amount - (amount * slippageBasisPoints) / BigInt(10000);
  };

  // Minimum token amounts (adjusted for slippage)
  const minAmount0 = calculateMinAmount(amount0, slippagePercent);
  const minAmount1 = calculateMinAmount(amount1, slippagePercent);

  // Write contract hook for modifying the liquidity position
  const {
    writeContractAsync,
    isPending,
    data,
    error: writeError,
  } = useWriteContract();

  // Helper function to call increaseLiquidityPosition (defined *after* writeContractAsync)
  const callIncreaseLiquidity = useCallback(
    async (deadline: bigint) => {
      const increaseParams = {
        positionId: BigInt(positionId!),
        collateralAmount: parsedCollateralDelta,
        gasTokenAmount: amount0,
        ethTokenAmount: amount1,
        minGasAmount: minAmount0,
        minEthAmount: minAmount1,
        deadline,
      };
      return writeContractAsync({
        address: marketAddress!,
        abi: marketAbi,
        functionName: 'increaseLiquidityPosition',
        chainId,
        args: [increaseParams],
      });
    },
    [
      positionId,
      parsedCollateralDelta,
      amount0,
      amount1,
      minAmount0,
      minAmount1,
      writeContractAsync,
      marketAddress,
      marketAbi,
      chainId,
    ]
  );

  // Helper function to call decreaseLiquidityPosition (defined *after* writeContractAsync)
  const callDecreaseLiquidity = useCallback(
    async (deadline: bigint) => {
      const decreaseParams = {
        positionId: BigInt(positionId!),
        liquidity: liquidityDelta,
        minGasAmount: minAmount0,
        minEthAmount: minAmount1,
        deadline,
      };
      return writeContractAsync({
        address: marketAddress!,
        abi: marketAbi,
        functionName: 'decreaseLiquidityPosition',
        chainId,
        args: [decreaseParams],
      });
    },
    [
      positionId,
      liquidityDelta,
      minAmount0,
      minAmount1,
      writeContractAsync,
      marketAddress,
      marketAbi,
      chainId,
    ]
  );

  // Watch for transaction completion
  const {
    isLoading: isConfirming,
    isSuccess,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Set error if any occur during the process
  useEffect(() => {
    if (writeError) {
      setError(writeError);
      setProcessingTx(false); // Reset processing state on write error
    }
    if (txError) {
      setError(txError);
      setProcessingTx(false); // Reset processing state on transaction error
    }
    if (approvalError) {
      setError(approvalError);
      setProcessingTx(false); // Reset processing state on approval error
    }
  }, [writeError, txError, approvalError]);

  // Function to actually modify the liquidity position
  const performModifyLP = useCallback(async (): Promise<void> => {
    // Guard clause for required parameters
    if (!enabled || !marketAddress || !positionId) {
      const errorMsg =
        'Missing required parameters for modifying liquidity position';
      console.error('performModifyLP check failed:', errorMsg);
      setError(new Error(errorMsg));
      setProcessingTx(false); // Ensure processing state is reset
      return;
    }

    setError(null);
    setProcessingTx(true);

    try {
      // Inlined executeContractCall logic:
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      let hash: `0x${string}` | undefined;

      if (isAddMode) {
        hash = await callIncreaseLiquidity(deadline);
      } else {
        hash = await callDecreaseLiquidity(deadline);
      }

      setTxHash(hash);
      toast({
        title: 'Transaction Submitted',
        description: `Liquidity ${isAddMode ? 'increase' : 'decrease'} submitted.`,
      });
    } catch (err) {
      console.error(
        `Error performing ${isAddMode ? 'increase' : 'decrease'} LP:`,
        err
      );
      setError(
        err instanceof Error ? err : new Error('Failed to send transaction')
      );
      setProcessingTx(false); // Ensure processing state is reset on error
    }
    // Note: processingTx contributes to the overall isLoading state and is managed there.
    // It is reset here only on early return or error.
  }, [
    enabled,
    marketAddress,
    positionId,
    isAddMode,
    setTxHash,
    setError,
    setProcessingTx,
    toast,
    callIncreaseLiquidity,
    callDecreaseLiquidity,
    // Dependencies updated based on direct usage and helper callbacks
  ]);

  // When approval is successful, proceed with modifying the LP
  useEffect(() => {
    const handleApprovalSuccess = async () => {
      // Return early if the conditions aren't met
      if (!isApproveSuccess || !processingTx) {
        return;
      }

      // Conditions are met, proceed with the logic
      const actionDescription = isAddMode ? 'Adding to' : 'Removing from';
      toast({
        title: 'Token Approved',
        description: `${actionDescription} liquidity position...`,
      });

      try {
        await performModifyLP();
      } catch (err) {
        // Handle potential errors during the LP modification after approval
        setProcessingTx(false);
        console.error(`Error ${actionDescription} LP after approval:`, err);
        setError(
          err instanceof Error
            ? err
            : new Error(`LP ${actionDescription} failed after approval`)
        );
      }
    };

    handleApprovalSuccess();
    // Dependencies remain the same as the logic using them hasn't fundamentally changed paths
  }, [isApproveSuccess, processingTx, isAddMode, performModifyLP, toast]);

  // Main function exposed by the hook
  const modifyLP = async (): Promise<void> => {
    if (!enabled) {
      setError(new Error('Modification is disabled due to invalid inputs'));
      return;
    }

    setProcessingTx(true);
    setError(null);

    try {
      if (isAddMode && needsApproval) {
        toast({
          title: 'Approval Required',
          description: `Approving ${collateralDelta} tokens...`,
        });
        await approve();
      } else {
        await performModifyLP();
      }
    } catch (err) {
      setProcessingTx(false);
      console.error('Error in modifyLP flow:', err);
      setError(
        err instanceof Error ? err : new Error('An unexpected error occurred')
      );
    }
  };

  return {
    modifyLP,
    isLoading: isPending || isConfirming || processingTx,
    isSuccess,
    isError: !!error,
    error,
    txHash,
    data,
    isApproving,
    hasAllowance,
    needsApproval,
  };
}
