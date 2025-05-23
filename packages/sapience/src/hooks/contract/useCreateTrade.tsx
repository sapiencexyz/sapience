import { useToast } from '@foil/ui/hooks/use-toast';
import { useEffect, useMemo, useState } from 'react';
import { erc20Abi, parseUnits, type Abi } from 'viem';
import { useSendCalls } from 'wagmi';

import { TOKEN_DECIMALS } from '~/lib/constants/numbers';

import { useTokenApproval } from './useTokenApproval';
import {
  useWaitForSendCalls,
  type SendCallsResult,
} from './useWaitForSendCalls';

/**
 * Parameters for creating a trader position
 */
export interface CreateTradeParams {
  marketAddress: `0x${string}`;
  marketAbi: Abi;
  chainId?: number;
  numericMarketId: number;
  size: bigint;
  collateralAmount: string;
  slippagePercent: number;
  enabled?: boolean;
  collateralTokenAddress?: `0x${string}`;
}

/**
 * Result of a trader position creation operation
 */
export interface CreateTradeResult {
  createTrade: () => Promise<void>;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  txHash: `0x${string}` | undefined;
  hasAllowance: boolean;
  allTxHashes: `0x${string}`[];
}

type PotentialRpcError = Error & { shortMessage?: string };

/**
 * Hook for creating a trader position with slippage handling
 */
export function useCreateTrade({
  marketAddress,
  marketAbi,
  chainId,
  numericMarketId,
  size,
  collateralAmount,
  slippagePercent,
  enabled = true,
  collateralTokenAddress,
}: CreateTradeParams): CreateTradeResult & { reset: () => void } {
  const { toast } = useToast();
  const [sendCallsResult, setSendCallsResult] =
    useState<SendCallsResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [processingTx, setProcessingTx] = useState(false);
  const [callsCount, setCallsCount] = useState(0);

  // Parse collateral amount once
  const parsedCollateralAmount = parseUnits(
    collateralAmount || '0',
    TOKEN_DECIMALS
  );

  // Check token allowance
  const { hasAllowance } = useTokenApproval({
    tokenAddress: collateralTokenAddress,
    spenderAddress: marketAddress,
    amount: collateralAmount,
    chainId,
    enabled: enabled && !!collateralTokenAddress,
  });

  const needsApproval = useMemo(
    () =>
      !hasAllowance &&
      collateralTokenAddress !== undefined &&
      parsedCollateralAmount > BigInt(0),
    [hasAllowance, collateralTokenAddress, parsedCollateralAmount]
  );

  // Determine if hook should be enabled based on inputs
  const isValidInputs = useMemo(() => {
    return size !== BigInt(0) && parsedCollateralAmount !== BigInt(0);
  }, [size, parsedCollateralAmount]);

  // Combine external enabled flag with input validation
  const isEnabled = enabled && isValidInputs;

  // Calculate collateral limit including slippage
  const calculateCollateralLimit = (
    amount: bigint,
    slippage: number
  ): bigint => {
    if (amount === BigInt(0)) return BigInt(0);
    const slippageFactor = BigInt(10000 + Math.floor(slippage * 100));
    return (amount * slippageFactor) / BigInt(10000);
  };

  const limitCollateral = calculateCollateralLimit(
    parsedCollateralAmount,
    slippagePercent
  );

  // Use sendCalls hook for handling trade creation
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
  }, [isSuccess, error, isConfirming, txHash]);

  const createTrade = async (): Promise<void> => {
    if (!isEnabled) {
      setError(new Error('Trade creation is disabled due to invalid inputs'));
      return;
    }

    setProcessingTx(true);
    setError(null);
    setSendCallsResult(null);

    try {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      const calls = [];

      // Add approval call if needed
      if (needsApproval) {
        calls.push({
          to: collateralTokenAddress!,
          abi: erc20Abi,
          functionName: 'approve',
          args: [marketAddress, parsedCollateralAmount],
        });
      }

      // Add trade creation call
      calls.push({
        to: marketAddress,
        abi: marketAbi,
        functionName: 'createTraderPosition',
        args: [numericMarketId, size, limitCollateral, deadline],
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
        description: 'Your trade transaction has been submitted.',
      });
    } catch (err) {
      let errorMessage: string;
      if (err instanceof Error && 'shortMessage' in err) {
        errorMessage = (err as PotentialRpcError).shortMessage!;
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Failed to submit trade transaction.';
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
    createTrade,
    isLoading,
    isSuccess,
    isError,
    error: error || txError,
    txHash,
    hasAllowance,
    allTxHashes,
    reset,
  };
}
