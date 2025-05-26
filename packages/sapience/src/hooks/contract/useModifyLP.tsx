/* eslint-disable sonarjs/cognitive-complexity */

import { useToast } from '@foil/ui/hooks/use-toast';
import { useEffect, useMemo, useState } from 'react';
import { erc20Abi, parseUnits, type Abi } from 'viem';
import { useSendCalls } from 'wagmi';

import { useTokenApproval } from './useTokenApproval';
import {
  useWaitForSendCalls,
  type SendCallsResult,
} from './useWaitForSendCalls';

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
  hasAllowance: boolean;
  allTxHashes: `0x${string}`[];
}

type PotentialRpcError = Error & { shortMessage?: string };

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
}: ModifyLPParams): ModifyLPResult & { reset: () => void } {
  const { toast } = useToast();
  const [sendCallsResult, setSendCallsResult] =
    useState<SendCallsResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);
  const [callsCount, setCallsCount] = useState(0);

  // Only need approval when adding liquidity
  const isAddMode = mode === 'add';
  const needsApprovalCheck =
    isAddMode &&
    !!collateralTokenAddress &&
    parseFloat(collateralDelta || '0') > 0;

  // Check token allowance for when adding liquidity
  const { hasAllowance } = useTokenApproval({
    tokenAddress: collateralTokenAddress,
    spenderAddress: marketAddress,
    amount: collateralDelta,
    chainId,
    enabled: enabled && needsApprovalCheck,
  });

  // Check if approval is needed
  const needsApproval = useMemo(
    () => needsApprovalCheck && !hasAllowance,
    [needsApprovalCheck, hasAllowance]
  );

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

  // Use sendCalls hook for handling LP modification
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

  // Main function exposed by the hook
  const modifyLP = async (): Promise<void> => {
    if (!enabled || !marketAddress || !positionId) {
      setError(
        new Error(
          'Missing required parameters for modifying liquidity position'
        )
      );
      return;
    }

    setProcessingTx(true);
    setError(null);
    setSendCallsResult(null);

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const calls = [];

      // Add approval call if needed (only for add mode)
      if (needsApproval && collateralTokenAddress) {
        calls.push({
          to: collateralTokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [marketAddress, parsedCollateralDelta],
        });
      }

      // Add the appropriate LP modification call
      if (isAddMode) {
        const increaseParams = {
          positionId: BigInt(positionId),
          collateralAmount: parsedCollateralDelta,
          gasTokenAmount: amount0,
          ethTokenAmount: amount1,
          minGasAmount: minAmount0,
          minEthAmount: minAmount1,
          deadline,
        };

        calls.push({
          to: marketAddress,
          abi: marketAbi,
          functionName: 'increaseLiquidityPosition',
          args: [increaseParams],
        });
      } else {
        const decreaseParams = {
          positionId: BigInt(positionId),
          liquidity: liquidityDelta,
          minGasAmount: minAmount0,
          minEthAmount: minAmount1,
          deadline,
        };

        calls.push({
          to: marketAddress,
          abi: marketAbi,
          functionName: 'decreaseLiquidityPosition',
          args: [decreaseParams],
        });
      }

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
        description: `Liquidity ${isAddMode ? 'increase' : 'decrease'} submitted.`,
      });
    } catch (err) {
      let errorMessage: string;
      if (err instanceof Error && 'shortMessage' in err) {
        errorMessage = (err as PotentialRpcError).shortMessage!;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Failed to submit liquidity modification.';
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
    modifyLP,
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
