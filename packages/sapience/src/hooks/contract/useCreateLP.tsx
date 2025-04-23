import { useToast } from '@foil/ui/hooks/use-toast';
import { useEffect, useState } from 'react';
import { parseUnits } from 'viem';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import { CREATE_LIQUIDITY_REDUCTION_PERCENT } from '~/lib/constants/numbers';

import { useTokenApproval } from './useTokenApproval';

/**
 * Parameters for creating a liquidity position
 */
export interface CreateLPParams {
  marketAddress: `0x${string}`;
  marketAbi: any;
  chainId?: number;
  marketId: bigint;
  collateralAmount: string;
  lowPriceTick: number;
  highPriceTick: number;
  amount0: bigint;
  amount1: bigint;
  slippagePercent: number;
  enabled?: boolean;
  collateralTokenAddress?: `0x${string}`;
}

/**
 * Result of a liquidity position creation operation
 */
export interface CreateLPResult {
  createLP: () => Promise<void>;
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
 * Hook for creating a liquidity position with automatic token approval
 */
export function useCreateLP({
  marketAddress,
  marketAbi,
  chainId,
  marketId,
  collateralAmount,
  lowPriceTick,
  highPriceTick,
  amount0,
  amount1,
  slippagePercent,
  enabled = true,
  collateralTokenAddress,
}: CreateLPParams): CreateLPResult {
  const { toast } = useToast();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);

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
    amount: collateralAmount,
    chainId,
    enabled: enabled && !!collateralTokenAddress,
  });

  // Check if approval is needed
  const needsApproval =
    !hasAllowance &&
    collateralTokenAddress !== undefined &&
    parseFloat(collateralAmount || '0') > 0;

  // Parse collateral amount
  const parsedCollateralAmount = parseUnits(collateralAmount || '0', 18);

  // Calculate min amounts based on slippage percentage
  const calculateMinAmount = (
    amount: bigint,
    slippagePercent: number
  ): bigint => {
    if (amount === BigInt(0)) return BigInt(0);
    const slippageBasisPoints = BigInt(Math.floor(slippagePercent * 100));
    return amount - (amount * slippageBasisPoints) / BigInt(10000);
  };

  // Write contract hook for creating the liquidity position
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
    if (writeError) setError(writeError);
    if (txError) setError(txError);
    if (approvalError) setError(approvalError);
  }, [writeError, txError, approvalError]);

  // When approval is successful, proceed with creating the LP
  useEffect(() => {
    const handleApprovalSuccess = async () => {
      // Only proceed if we have a successful approval and we're in the middle of processing
      if (isApproveSuccess && processingTx) {
        toast({
          title: 'Token Approved',
          description: 'Creating liquidity position...',
        });

        // Now proceed with LP creation
        try {
          await performCreateLP();
        } catch (err) {
          setProcessingTx(false);
          console.error('Error creating LP after approval:', err);
        }
      }
    };

    handleApprovalSuccess();
  }, [isApproveSuccess, processingTx]);

  // Function to actually create the liquidity position
  const performCreateLP = async (): Promise<void> => {
    if (!enabled || !marketAddress || !amount0 || !amount1) {
      throw new Error(
        'Missing required parameters for creating liquidity position'
      );
    }

    try {
      setError(null);

      // 30 minutes from now
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const adjustedBaseToken = BigInt(
        Number(amount0) * (1 - CREATE_LIQUIDITY_REDUCTION_PERCENT)
      );
      const adjustedQuoteToken = BigInt(
        Number(amount1) * (1 - CREATE_LIQUIDITY_REDUCTION_PERCENT)
      );

      // Calculate minimum amounts based on slippage tolerance
      const minAmount0 = calculateMinAmount(adjustedBaseToken, slippagePercent);
      const minAmount1 = calculateMinAmount(
        adjustedQuoteToken,
        slippagePercent
      );

      // Prepare the parameters for the createLiquidityPosition function
      const liquidityParams = {
        epochId: marketId,
        lowerTick: BigInt(lowPriceTick),
        upperTick: BigInt(highPriceTick),
        amountTokenA: adjustedBaseToken,
        amountTokenB: adjustedQuoteToken,
        collateralAmount: parsedCollateralAmount,
        minAmountTokenA: minAmount0,
        minAmountTokenB: minAmount1,
        deadline,
      };

      console.log('liquidityParams', liquidityParams);

      // Call the contract function
      const hash = await writeContractAsync({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'createLiquidityPosition',
        chainId,
        args: [liquidityParams],
      });

      setTxHash(hash);

      toast({
        title: 'Transaction Submitted',
        description: 'Your transaction has been submitted to the network.',
      });
    } catch (err) {
      console.error('Error creating liquidity position:', err);
      setError(
        err instanceof Error
          ? err
          : new Error('Failed to create liquidity position')
      );
      throw err;
    }
  };

  // Main function that checks approval and handles the flow
  const createLP = async (): Promise<void> => {
    setProcessingTx(true);

    try {
      // First check if we need approval
      if (needsApproval) {
        toast({
          title: 'Approval Required',
          description: 'Approving tokens before creating position...',
        });
        await approve();
        // The createLP call will be triggered by the useEffect when approval succeeds
      } else {
        // If we already have allowance, create LP directly
        await performCreateLP();
        setProcessingTx(false);
      }
    } catch (err) {
      setProcessingTx(false);
      console.error('Error in LP creation flow:', err);
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
    createLP,
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
