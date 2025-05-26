import { useToast } from '@foil/ui/hooks/use-toast';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { erc20Abi, formatUnits, type Abi } from 'viem';
import { useSendCalls } from 'wagmi';

import { TOKEN_DECIMALS } from '~/lib/constants/numbers';

import { useTokenApproval } from './useTokenApproval';
import {
  useWaitForSendCalls,
  type SendCallsResult,
} from './useWaitForSendCalls';

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

export interface ModifyTradeResult {
  modifyTrade: () => Promise<void>;
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
}: UseModifyTradeProps): ModifyTradeResult & { reset: () => void } {
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
    amount: formatUnits(collateralAmount || BigInt(0), TOKEN_DECIMALS),
    chainId,
    enabled: enabled && !!collateralTokenAddress,
  });

  const needsApproval = useMemo(
    () =>
      !hasAllowance &&
      collateralTokenAddress !== undefined &&
      collateralAmount !== undefined &&
      collateralAmount > BigInt(0),
    [hasAllowance, collateralTokenAddress, collateralAmount]
  );

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

  // Use sendCalls hook for handling modification
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

  // Main function that modifies the trade position
  const modifyTrade = async (): Promise<void> => {
    if (!enabled || !marketAddress || !marketAbi) {
      setError(new Error('Invalid parameters for position modification'));
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
          args: [marketAddress, collateralAmount],
        });
      }

      // Add modify position call
      calls.push({
        to: marketAddress,
        abi: marketAbi,
        functionName: 'modifyTraderPosition',
        args: [positionId, newSize, collateralDeltaLimit(), deadline],
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
        description: 'Your position modification has been submitted.',
      });
    } catch (err) {
      let errorMessage: string;
      if (err instanceof Error && 'shortMessage' in err) {
        errorMessage = (err as PotentialRpcError).shortMessage!;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Failed to submit position modification.';
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
    modifyTrade,
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
