import { useToast } from '@foil/ui/hooks/use-toast';
import { useCallback, useEffect, useState } from 'react';
import type { Abi } from 'viem';
import { encodeFunctionData, parseUnits } from 'viem';
import { useSendCalls, useWaitForTransactionReceipt } from 'wagmi';

import erc20ABI from '@foil/ui/abis/erc20abi.json';

import { useTokenApproval } from './useTokenApproval';

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
  data?: `0x${string}` | undefined;
  isApproving: boolean;
  hasAllowance: boolean;
  needsApproval: boolean;
}

// Helper function to calculate minimum amounts based on slippage
function calculateMinAmount(amount: bigint, slippage: number): bigint {
  if (amount === BigInt(0)) return BigInt(0);
  const slippageBasisPoints = BigInt(Math.floor(slippage * 100));
  return amount - (amount * slippageBasisPoints) / BigInt(10000);
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>(undefined);

  const { sendCallsAsync } = useSendCalls();

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
    if (txError) {
      setError(txError);
      setIsProcessing(false);
    }
    if (approvalError) {
      setError(approvalError);
      setIsProcessing(false);
    }
  }, [txError, approvalError]);

  const performCreateLP = useCallback(async () => {
    if (!enabled) return;

    setIsProcessing(true);
    setError(null);
    setTxHash(undefined);

    try {
      // Calculate minimum amounts based on slippage
      const minAmount0 = calculateMinAmount(amount0, slippagePercent);
      const minAmount1 = calculateMinAmount(amount1, slippagePercent);

      // Set a deadline for the transaction (30 minutes from now)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      // Prepare the calls array
      const calls = [];

      // Add approval call if needed
      if (needsApproval && collateralTokenAddress) {
        calls.push({
          to: collateralTokenAddress,
          data: encodeFunctionData({
            abi: erc20ABI,
            functionName: 'approve',
            args: [marketAddress, parsedCollateralAmount],
          }),
        });
      }

      // Add LP creation call
      calls.push({
        to: marketAddress,
        data: encodeFunctionData({
          abi: marketAbi,
          functionName: 'createLiquidityPosition',
          args: [
            {
              epochId: marketId,
              amountTokenA: amount0,
              amountTokenB: amount1,
              collateralAmount: parsedCollateralAmount,
              lowerTick: lowPriceTick,
              upperTick: highPriceTick,
              minAmountTokenA: minAmount0,
              minAmountTokenB: minAmount1,
              deadline: deadline,
            },
          ],
        }),
      });

      // Execute the transaction
      const result = await sendCallsAsync({ calls });
      setTxHash(result.id as `0x${string}`);
    } catch (err) {
      console.error('Error creating LP:', err);
      setError(err instanceof Error ? err : new Error('Failed to create LP'));
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [
    enabled,
    amount0,
    amount1,
    slippagePercent,
    collateralTokenAddress,
    marketAddress,
    marketAbi,
    marketId,
    lowPriceTick,
    highPriceTick,
    parsedCollateralAmount,
    sendCallsAsync,
    needsApproval,
  ]);

  // Main function that handles the flow
  const createLP = async (): Promise<void> => {
    setIsProcessing(true);
    setError(null);

    try {
      await performCreateLP();
    } catch (err) {
      setIsProcessing(false);
      console.error('Error in LP creation flow:', err);
      throw err;
    }
  };

  // Reset processing state on success
  useEffect(() => {
    if (isSuccess) {
      setIsProcessing(false);
    }
  }, [isSuccess]);

  // Reset processing state on error from transaction
  useEffect(() => {
    if (error) {
      setIsProcessing(false);
    }
  }, [error]);

  return {
    createLP,
    isLoading: isConfirming || isProcessing,
    isSuccess,
    isError: !!error,
    error,
    txHash,
    data: undefined,
    isApproving: false,
    hasAllowance: true,
    needsApproval: false,
  };
}
