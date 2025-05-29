import { useToast } from '@foil/ui/hooks/use-toast';
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, type Abi } from 'viem';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { TOKEN_DECIMALS } from '~/lib/constants/numbers';

import { useTokenApproval } from './useTokenApproval';

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
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);
  const [isClosingPosition, setIsClosingPosition] = useState(false);

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

  // Write contract hook for modifying the position
  const {
    writeContractAsync,
    isPending,
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
  });

  // Set error if any occur during the process
  useEffect(() => {
    if (writeError) {
      setError(writeError);
      setProcessingTx(false);
    }
    if (txError) {
      setError(txError);
      setProcessingTx(false);
    }
    if (approvalError) {
      setError(approvalError);
      setProcessingTx(false);
    }
  }, [writeError, txError, approvalError]);

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

      const hash = await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'modifyTraderPosition',
        args: [positionId, newSize, collateralDeltaLimit(), deadline],
        chainId,
      });
      setTxHash(hash);
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
    writeContractAsync,
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

      // Close position by setting size to 0
      const hash = await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'modifyTraderPosition',
        args: [positionId, BigInt(0), BigInt(0), deadline], // size = 0, no collateral delta needed for closing
        chainId,
      });
      setTxHash(hash);
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
    writeContractAsync,
    processingTx,
  ]);

  // Reset processing state on success
  useEffect(() => {
    if (isSuccess) {
      setProcessingTx(false);
      setIsClosingPosition(false);
    }
  }, [isSuccess]);

  return {
    modifyTrade,
    closePosition,
    isLoading: isPending || isConfirming || processingTx,
    isClosingPosition,
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
