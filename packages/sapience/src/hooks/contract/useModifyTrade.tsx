import { useToast } from '@sapience/ui/hooks/use-toast';
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Abi } from 'viem';

import { useTokenApproval } from './useTokenApproval';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { TOKEN_DECIMALS } from '~/lib/constants/numbers';

interface UseModifyTradeProps {
  marketAddress?: `0x${string}`;
  marketAbi: Abi;
  chainId?: number;
  positionId: bigint;
  newSize?: bigint;
  slippagePercent?: number;
  enabled?: boolean;
  collateralTokenAddress?: `0x${string}`;
  collateralAmount?: bigint;
}

/**
 * Hook to modify an existing trader position (increase, decrease, or close).
 */
export function useModifyTrade({
  marketAddress,
  marketAbi,
  chainId,
  positionId,
  newSize = BigInt(0),
  slippagePercent = 0.5,
  enabled = true,
  collateralTokenAddress,
  collateralAmount,
}: UseModifyTradeProps) {
  const { toast } = useToast();
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);
  const [isClosingPosition, setIsClosingPosition] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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
    amount: formatUnits(collateralAmount || BigInt(0), TOKEN_DECIMALS),
    chainId,
    enabled: enabled && !!collateralTokenAddress,
  });

  // Check if approval is needed
  const needsApproval =
    !hasAllowance &&
    collateralTokenAddress !== undefined &&
    collateralAmount !== undefined &&
    collateralAmount > BigInt(0);

  // Calculate collateral delta limit with slippage
  const collateralDeltaLimit = useCallback(() => {
    if (!collateralAmount || collateralAmount === BigInt(0)) return BigInt(0);

    const slippageBasisPoints = BigInt(Math.floor(slippagePercent * 100));
    const basisPoints = BigInt(10000);

    if (collateralAmount > BigInt(0)) {
      return (
        (collateralAmount * (BigInt(10000) + slippageBasisPoints)) / basisPoints
      );
    }
    return (
      (collateralAmount * (BigInt(10000) - slippageBasisPoints)) / basisPoints
    );
  }, [collateralAmount, slippagePercent]);

  // Use Sapience write contract hook for modifying the position
  const { writeContract: sapienceWriteContract, isPending } =
    useSapienceWriteContract({
      onSuccess: () => {
        setProcessingTx(false);
        setIsClosingPosition(false);
        setIsSuccess(true);
        setError(null);
      },
      onError: (error: Error) => {
        setError(error);
        setProcessingTx(false);
        setIsClosingPosition(false);
        setIsSuccess(false);
      },
      onTxHash: (_txHash: `0x${string}`) => {
        // Success toast is handled centrally in the write hook after redirect
      },
      successMessage: 'Position modification submission was successful',
      fallbackErrorMessage: 'Failed to modify position',
      redirectProfileAnchor: 'trades',
    });

  // Set error if approval error occurs
  useEffect(() => {
    if (approvalError) {
      setError(approvalError);
      setProcessingTx(false);
    }
  }, [approvalError]);

  // Function to actually modify the position
  const performModification = useCallback(async (): Promise<void> => {
    if (!enabled || !marketAddress || !marketAbi) {
      setProcessingTx(false);
      console.error('Missing required parameters for modifying position');
      setError(new Error('Invalid parameters for position modification'));
      return;
    }

    try {
      setError(null);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 minutes deadline

      const modifyTradeParams = {
        positionId,
        size: newSize,
        deltaCollateralLimit: collateralDeltaLimit(),
        deadline,
      };

      await sapienceWriteContract({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'modifyTraderPosition',
        args: [modifyTradeParams],
        chainId,
      });
    } catch (err) {
      console.error('Error in performModification:', err);
      setError(
        err instanceof Error ? err : new Error('Failed to send transaction')
      );
      setProcessingTx(false);
    }
  }, [
    enabled,
    marketAddress,
    marketAbi,
    newSize,
    positionId,
    collateralDeltaLimit,
    chainId,
  ]);

  // When approval is successful, proceed with modification
  useEffect(() => {
    const handleApprovalSuccess = async () => {
      if (isApproveSuccess && processingTx && needsApproval) {
        toast({
          title: 'Token Approved',
          description: 'Modifying position...',
        });

        try {
          await performModification();
        } catch (err) {
          setProcessingTx(false);
          console.error('Error modifying position after approval:', err);
          setError(
            err instanceof Error
              ? err
              : new Error('Position modification failed after approval')
          );
        }
      }
    };

    handleApprovalSuccess();
  }, [
    isApproveSuccess,
    processingTx,
    performModification,
    toast,
    needsApproval,
  ]);

  // Main function that checks approval and handles the flow
  const modifyTrade = async (): Promise<void> => {
    if (processingTx) return;
    setProcessingTx(true);
    setError(null);

    try {
      if (needsApproval) {
        toast({
          title: 'Approval Required',
          description: 'Approving tokens before modifying position...',
        });
        await approve();
      } else {
        await performModification();
        setProcessingTx(false);
      }
    } catch (err) {
      setProcessingTx(false);
      console.error('Error in modification flow:', err);
      throw err;
    }
  };

  // Function to close position (sets size to 0)
  const closePosition = useCallback(async (): Promise<void> => {
    if (processingTx) return;
    if (!enabled || !marketAddress || !marketAbi) {
      console.error('Missing required parameters for closing position');
      setError(new Error('Invalid parameters for position closure'));
      return;
    }

    setProcessingTx(true);
    setIsClosingPosition(true);
    setError(null);

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 minutes deadline

      const modifyTradeParams = {
        positionId,
        size: BigInt(0),
        deltaCollateralLimit: BigInt(0),
        deadline,
      };

      // Close position by setting size to 0
      await sapienceWriteContract({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'modifyTraderPosition',
        args: [modifyTradeParams],
        chainId,
      });
    } catch (err) {
      console.error('Error in closePosition:', err);
      setError(
        err instanceof Error ? err : new Error('Failed to close position')
      );
      setProcessingTx(false);
      setIsClosingPosition(false);
    }
  }, [
    enabled,
    marketAddress,
    marketAbi,
    positionId,
    chainId,
    sapienceWriteContract,
    processingTx,
  ]);

  return {
    modifyTrade,
    closePosition,
    isLoading: isPending || processingTx,
    isClosingPosition,
    isSuccess,
    isError: !!error,
    error,
    isApproving,
    hasAllowance,
    needsApproval,
  };
}
