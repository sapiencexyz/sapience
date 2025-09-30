import { useToast } from '@sapience/ui/hooks/use-toast';
import { useEffect, useState, useCallback } from 'react';
import type { Abi } from 'viem';
import { parseUnits } from 'viem';

import { useTokenApproval } from './useTokenApproval';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

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
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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

  // Use Sapience write contract hook for modifying the liquidity position
  const { writeContract: sapienceWriteContract, isPending } =
    useSapienceWriteContract({
      onSuccess: () => {
        setIsSuccess(true);
        setProcessingTx(false);
        setError(null);
      },
      onError: (error: Error) => {
        setError(error);
        setProcessingTx(false);
        setIsSuccess(false);
      },
      onTxHash: (_txHash: `0x${string}`) => {
        // Success toast is handled centrally in the write hook after redirect
      },
      successMessage: `Liquidity ${isAddMode ? 'increase' : 'decrease'} submission was successful`,
      fallbackErrorMessage: `Liquidity ${isAddMode ? 'increase' : 'decrease'} failed`,
      redirectProfileAnchor: 'lp',
    });

  // Helper function to call increaseLiquidityPosition
  const callIncreaseLiquidity = useCallback(
    async (deadline: bigint) => {
      const increaseParams = {
        positionId: BigInt(positionId),
        collateralAmount: parsedCollateralDelta,
        baseTokenAmount: amount0,
        quoteTokenAmount: amount1,
        minBaseAmount: minAmount0,
        minQuoteAmount: minAmount1,
        deadline,
      };
      return sapienceWriteContract({
        address: marketAddress,
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
      marketAddress,
      marketAbi,
      chainId,
    ]
  );

  // Helper function to call decreaseLiquidityPosition
  const callDecreaseLiquidity = useCallback(
    async (deadline: bigint) => {
      const decreaseParams = {
        positionId: BigInt(positionId),
        liquidity: liquidityDelta,
        minBaseAmount: minAmount0,
        minQuoteAmount: minAmount1,
        deadline,
      };
      return sapienceWriteContract({
        address: marketAddress,
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
      marketAddress,
      marketAbi,
      chainId,
    ]
  );

  // Set error if approval error occurs
  useEffect(() => {
    if (approvalError) {
      setError(approvalError);
      setProcessingTx(false);
    }
  }, [approvalError]);

  // Function to actually modify the liquidity position
  const performModifyLP = useCallback(async (): Promise<void> => {
    // Guard clause for required parameters
    if (!enabled || !marketAddress || !positionId) {
      const errorMsg =
        'Missing required parameters for modifying liquidity position';
      console.error('performModifyLP check failed:', errorMsg);
      setError(new Error(errorMsg));
      setProcessingTx(false);
      return;
    }

    setError(null);
    setProcessingTx(true);
    setIsSuccess(false);

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      if (isAddMode) {
        await callIncreaseLiquidity(deadline);
      } else {
        await callDecreaseLiquidity(deadline);
      }
    } catch (err) {
      console.error(
        `Error performing ${isAddMode ? 'increase' : 'decrease'} LP:`,
        err
      );
      setError(
        err instanceof Error ? err : new Error('Failed to send transaction')
      );
      setProcessingTx(false);
    }
  }, [
    enabled,
    marketAddress,
    positionId,
    isAddMode,
    setError,
    setProcessingTx,
    callIncreaseLiquidity,
    callDecreaseLiquidity,
  ]);

  // When approval is successful, proceed with modifying the LP
  useEffect(() => {
    const handleApprovalSuccess = async () => {
      if (!isApproveSuccess || !processingTx) {
        return;
      }

      const actionDescription = isAddMode ? 'Adding to' : 'Removing from';
      toast({
        title: 'Token Approved',
        description: `${actionDescription} liquidity position...`,
      });

      try {
        await performModifyLP();
      } catch (err) {
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
  }, [isApproveSuccess, processingTx, isAddMode, performModifyLP, toast]);

  // Main function exposed by the hook
  const modifyLP = async (): Promise<void> => {
    if (!enabled) {
      setError(new Error('Modification is disabled due to invalid inputs'));
      return;
    }

    setProcessingTx(true);
    setError(null);
    setIsSuccess(false);

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
    isLoading: isPending || processingTx,
    isSuccess,
    isError: !!error,
    error,
    isApproving,
    hasAllowance,
    needsApproval,
  };
}
