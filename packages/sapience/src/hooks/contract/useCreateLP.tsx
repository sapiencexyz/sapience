import { useToast } from '@sapience/ui/hooks/use-toast';
import { useCallback, useEffect, useState } from 'react';
import type { Abi } from 'viem';
import { parseUnits } from 'viem';

import { useTokenApproval } from './useTokenApproval';
import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';
import { CREATE_LIQUIDITY_REDUCTION_PERCENT } from '~/lib/constants/numbers';

/**
 * Parameters for creating a liquidity position
 */
export interface CreateLPParams {
  marketAddress: `0x${string}`;
  marketAbi: Abi;
  chainId?: number;
  marketId: bigint;
  collateralAmount: string;
  lowPriceTick: number | null;
  highPriceTick: number | null;
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
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);

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

  // Use Sapience write contract hook
  const { writeContract: sapienceWriteContract, isPending: isWritingContract } =
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
      onTxHash: (hash: `0x${string}`) => {
        setTxHash(hash);
        toast({
          title: 'Transaction submitted.',
          description:
            'Liquidity position submission was successful. Hash: ' + hash,
          duration: 5000,
        });
      },
      successMessage: 'Liquidity position submission was successful',
      fallbackErrorMessage: 'Failed to create liquidity position',
    });

  // Set error if approval error occurs
  useEffect(() => {
    if (approvalError) {
      setError(approvalError);
      setProcessingTx(false);
    }
  }, [approvalError]);

  // Function to actually create the liquidity position
  const performCreateLP = useCallback(async (): Promise<void> => {
    // Define calculateMinAmount inside the useCallback scope
    const calculateMinAmount = (amount: bigint, slippage: number): bigint => {
      if (amount === BigInt(0)) return BigInt(0);
      const slippageBasisPoints = BigInt(Math.floor(slippage * 100));
      return amount - (amount * slippageBasisPoints) / BigInt(10000);
    };

    if (
      !enabled ||
      !marketAddress ||
      (!amount0 && !amount1) ||
      lowPriceTick === null ||
      highPriceTick === null ||
      !chainId
    ) {
      setProcessingTx(false);
      console.error(
        'Missing required parameters for creating liquidity position or invalid ticks'
      );
      setError(new Error('Invalid parameters for LP creation'));
      return;
    }

    try {
      setError(null);
      setIsSuccess(false);
      setTxHash(undefined);

      // 30 minutes from now
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const adjustedBaseToken = BigInt(
        Math.floor(Number(amount0) * (1 - CREATE_LIQUIDITY_REDUCTION_PERCENT))
      );
      const adjustedQuoteToken = BigInt(
        Math.floor(Number(amount1) * (1 - CREATE_LIQUIDITY_REDUCTION_PERCENT))
      );

      // Calculate minimum amounts based on slippage tolerance
      const minAmount0 = calculateMinAmount(adjustedBaseToken, slippagePercent);
      const minAmount1 = calculateMinAmount(
        adjustedQuoteToken,
        slippagePercent
      );

      console.log(
        'Low Price Tick:',
        lowPriceTick,
        'High Price Tick:',
        highPriceTick
      );

      // Prepare the parameters for the createLiquidityPosition function
      const liquidityParams = {
        marketId,
        lowerTick: BigInt(lowPriceTick),
        upperTick: BigInt(highPriceTick),
        amountBaseToken: adjustedBaseToken,
        amountQuoteToken: adjustedQuoteToken,
        collateralAmount: parsedCollateralAmount,
        minAmountBaseToken: minAmount0,
        minAmountQuoteToken: minAmount1,
        deadline,
      };
      console.log('Liquidity Params:', liquidityParams);

      setProcessingTx(true);
      await sapienceWriteContract({
        address: marketAddress,
        abi: marketAbi,
        functionName: 'createLiquidityPosition',
        args: [liquidityParams],
        chainId,
      });
    } catch (err) {
      console.error('Error in performCreateLP:', err);
      setError(
        err instanceof Error ? err : new Error('Failed to send transaction')
      );
      setProcessingTx(false);
    }
  }, [
    enabled,
    marketAddress,
    amount0,
    amount1,
    lowPriceTick,
    highPriceTick,
    slippagePercent,
    marketId,
    parsedCollateralAmount,
    marketAbi,
    chainId,
    toast,
  ]);

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
          setError(
            err instanceof Error
              ? err
              : new Error('LP creation failed after approval')
          );
        }
      }
    };

    handleApprovalSuccess();
  }, [isApproveSuccess, processingTx, performCreateLP, toast]);

  // Main function that checks approval and handles the flow
  const createLP = async (): Promise<void> => {
    setProcessingTx(true);
    setError(null);
    setIsSuccess(false);
    setTxHash(undefined);

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
      }
    } catch (err) {
      setProcessingTx(false);
      console.error('Error in LP creation flow:', err);
      throw err;
    }
  };

  return {
    createLP,
    isLoading: isWritingContract || processingTx,
    isSuccess,
    isError: !!error,
    error,
    txHash,
    isApproving,
    hasAllowance,
    needsApproval,
  };
}
