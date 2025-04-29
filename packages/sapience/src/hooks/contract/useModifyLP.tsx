import { useToast } from '@foil/ui/hooks/use-toast';
import { useEffect, useState } from 'react';
import { parseUnits } from 'viem';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { useTokenApproval } from './useTokenApproval';

/**
 * Parameters for modifying a liquidity position
 */
export interface ModifyLPParams {
  marketAddress: `0x${string}`;
  marketAbi: any;
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
  data?: any;
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
  const calculateMinAmount = (
    amount: bigint,
    slippagePercent: number
  ): bigint => {
    if (amount === BigInt(0)) return BigInt(0);
    const slippageBasisPoints = BigInt(Math.floor(slippagePercent * 100));
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

  // When approval is successful, proceed with modifying the LP
  useEffect(() => {
    const handleApprovalSuccess = async () => {
      // Only proceed if we have a successful approval and we're in the middle of processing
      if (isApproveSuccess && processingTx) {
        toast({
          title: 'Token Approved',
          description: `${isAddMode ? 'Adding to' : 'Removing from'} liquidity position...`,
        });

        // Now proceed with LP modification
        try {
          await performModifyLP();
        } catch (err) {
          setProcessingTx(false);
          console.error(
            `Error ${isAddMode ? 'adding to' : 'removing from'} LP after approval:`,
            err
          );
        }
      }
    };

    handleApprovalSuccess();
  }, [isApproveSuccess, processingTx, isAddMode]);

  // Function to actually modify the liquidity position
  const performModifyLP = async (): Promise<void> => {
    if (!enabled || !marketAddress || !positionId) {
      throw new Error(
        'Missing required parameters for modifying liquidity position'
      );
    }

    try {
      setError(null);

      // 30 minutes from now
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      // Call the appropriate contract function based on mode
      if (isAddMode) {
        // Prepare the parameters for increaseLiquidityPosition
        const increaseParams = {
          positionId: BigInt(positionId),
          collateralAmount: parsedCollateralDelta, // Use the delta value
          gasTokenAmount: amount0,
          ethTokenAmount: amount1,
          minGasAmount: minAmount0,
          minEthAmount: minAmount1,
          deadline,
        };

        // Call the contract function
        const hash = await writeContractAsync({
          address: marketAddress,
          abi: marketAbi,
          functionName: 'increaseLiquidityPosition',
          chainId,
          args: [increaseParams],
        });

        setTxHash(hash);
      } else {
        // Remove mode
        // Prepare the parameters for decreaseLiquidityPosition
        const decreaseParams = {
          positionId: BigInt(positionId),
          liquidity: liquidityDelta,
          minGasAmount: minAmount0,
          minEthAmount: minAmount1,
          deadline,
        };

        // Call the contract function
        const hash = await writeContractAsync({
          address: marketAddress,
          abi: marketAbi,
          functionName: 'decreaseLiquidityPosition',
          chainId,
          args: [decreaseParams],
        });

        setTxHash(hash);
      }

      toast({
        title: 'Transaction Submitted',
        description: 'Your transaction has been submitted to the network.',
      });
    } catch (err) {
      console.error(
        `Error ${isAddMode ? 'adding to' : 'removing from'} liquidity position:`,
        err
      );
      setError(
        err instanceof Error
          ? err
          : new Error(
              `Failed to ${isAddMode ? 'add to' : 'remove from'} liquidity position`
            )
      );
      throw err;
    }
  };

  // Main function that checks approval and handles the flow
  const modifyLP = async (): Promise<void> => {
    setProcessingTx(true);

    try {
      // First check if we need approval (only for add mode)
      if (needsApproval) {
        toast({
          title: 'Approval Required',
          description: 'Approving tokens before modifying position...',
        });
        await approve();
        // The modifyLP call will be triggered by the useEffect when approval succeeds
      } else {
        // If we don't need approval or already have allowance, modify LP directly
        await performModifyLP();
        setProcessingTx(false);
      }
    } catch (err) {
      setProcessingTx(false);
      console.error('Error in LP modification flow:', err);
      throw err;
    }
  };

  // Reset processing state on success
  useEffect(() => {
    if (isSuccess) {
      setProcessingTx(false);
    }
  }, [isSuccess]);

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
