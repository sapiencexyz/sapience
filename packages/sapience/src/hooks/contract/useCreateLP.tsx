import { useToast } from '@foil/ui/hooks/use-toast';
import { useEffect, useMemo, useState } from 'react';
import { erc20Abi, parseUnits, type Abi } from 'viem';
import { useSendCalls } from 'wagmi';

import { CREATE_LIQUIDITY_REDUCTION_PERCENT } from '~/lib/constants/numbers';

import { useTokenApproval } from './useTokenApproval';
import {
  useWaitForSendCalls,
  type SendCallsResult,
} from './useWaitForSendCalls';

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
  hasAllowance: boolean;
  allTxHashes: `0x${string}`[];
}

type PotentialRpcError = Error & { shortMessage?: string };

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
}: CreateLPParams): CreateLPResult & { reset: () => void } {
  const { toast } = useToast();
  const [sendCallsResult, setSendCallsResult] =
    useState<SendCallsResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);
  const [callsCount, setCallsCount] = useState(0);

  // Check token allowance
  const { hasAllowance } = useTokenApproval({
    tokenAddress: collateralTokenAddress,
    spenderAddress: marketAddress,
    amount: collateralAmount,
    chainId,
    enabled: enabled && !!collateralTokenAddress,
  });

  // Check if approval is needed
  const needsApproval = useMemo(
    () =>
      !hasAllowance &&
      collateralTokenAddress !== undefined &&
      parseFloat(collateralAmount || '0') > 0,
    [hasAllowance, collateralTokenAddress, collateralAmount]
  );

  // Parse collateral amount
  const parsedCollateralAmount = parseUnits(collateralAmount || '0', 18);

  // Calculate minimum amounts based on slippage tolerance
  const calculateMinAmount = (amount: bigint, slippage: number): bigint => {
    if (amount === BigInt(0)) return BigInt(0);
    const slippageBasisPoints = BigInt(Math.floor(slippage * 100));
    return amount - (amount * slippageBasisPoints) / BigInt(10000);
  };

  // Use sendCalls hook for handling LP creation
  const { sendCallsAsync } = useSendCalls();

  // Use the new hook to wait for send calls
  const {
    txHash,
    isLoading: isConfirming,
    isSuccess,
    isError: isTxError,
    error: txError,
    allTxHashes,
  } = useWaitForSendCalls({
    result: sendCallsResult,
    callsCount,
    enabled: !!sendCallsResult,
  });

  // Set error if any occur during the process
  useEffect(() => {
    if (txError) setError(txError);
  }, [txError]);

  // Reset processing state on final success or error
  useEffect(() => {
    if (isSuccess || error) {
      setProcessingTx(false);
    }
  }, [isSuccess, error]);

  // Main function that creates the liquidity position
  const createLP = async (): Promise<void> => {
    if (
      !enabled ||
      !marketAddress ||
      (!amount0 && !amount1) ||
      lowPriceTick === null ||
      highPriceTick === null
    ) {
      setError(new Error('Invalid parameters for LP creation'));
      return;
    }

    setProcessingTx(true);
    setError(null);
    setSendCallsResult(null);

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const calls = [];

      // Add approval call if needed
      if (needsApproval && collateralTokenAddress) {
        calls.push({
          to: collateralTokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [marketAddress, parsedCollateralAmount],
        });
      }

      // Calculate adjusted amounts
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

      calls.push({
        to: marketAddress,
        abi: marketAbi,
        functionName: 'createLiquidityPosition',
        args: [liquidityParams],
      });

      setCallsCount(calls.length);

      const result = await sendCallsAsync({
        calls,
        chainId,
        experimental_fallback: true,
        experimental_fallbackDelay: 1000,
      });

      if (!result?.id) {
        throw new Error('No call ID returned from sendCallsAsync');
      }

      setSendCallsResult(result);

      toast({
        title: 'Transaction Submitted',
        description: 'Your liquidity position creation has been submitted.',
      });
    } catch (err) {
      let errorMessage: string;
      if (err instanceof Error && 'shortMessage' in err) {
        errorMessage = (err as PotentialRpcError).shortMessage!;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Failed to submit liquidity position creation.';
      }

      setError(err instanceof Error ? err : new Error(errorMessage));
      toast({
        title: 'Transaction Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      setProcessingTx(false);
    }
  };

  // Add a reset function to clear all state
  const reset = () => {
    setSendCallsResult(null);
    setError(null);
    setProcessingTx(false);
    setCallsCount(0);
  };

  const isLoading = isConfirming || processingTx;
  const isError = !!error || isTxError;

  return {
    createLP,
    isLoading,
    isSuccess,
    isError,
    error: error || txError,
    txHash,
    data: txHash,
    hasAllowance,
    allTxHashes,
    reset,
  };
}
