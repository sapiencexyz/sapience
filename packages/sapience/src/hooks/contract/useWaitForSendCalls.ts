import { useMemo } from 'react';
import { useCallsStatus, useWaitForTransactionReceipt } from 'wagmi';

export interface SendCallsResult {
  id: string;
}

export interface UseWaitForSendCallsProps {
  result: SendCallsResult | null;
  callsCount: number;
  enabled?: boolean;
}

export interface UseWaitForSendCallsReturn {
  txHash: `0x${string}` | undefined;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  allTxHashes: `0x${string}`[];
}

/**
 * Hook to handle sendCallsAsync results - supports both native sendCalls and fallback modes
 */
export function useWaitForSendCalls({
  result,
  callsCount,
  enabled = true,
}: UseWaitForSendCallsProps): UseWaitForSendCallsReturn {
  // Determine if this is a native sendCalls response or fallback
  const isNativeSendCalls = useMemo(() => {
    if (!result?.id) return false;

    // Native sendCalls returns shorter IDs (typically 32 bytes = 66 characters including 0x)
    // Fallback returns concatenated hashes which are much longer
    return result.id.length <= 66;
  }, [result?.id]);

  const { error: callsError, data: callsData } = useCallsStatus({
    id: result?.id as `0x${string}`,
    query: {
      enabled: !!result?.id && enabled && isNativeSendCalls,
    },
  });
  console.log('callsData', callsData);

  const { txHash, allTxHashes } = useMemo(() => {
    if (!result?.id || !enabled) {
      return { txHash: undefined, allTxHashes: [] };
    }

    if (isNativeSendCalls) {
      // Native sendCalls - extract hashes from callsData
      if (callsData?.receipts && callsData.receipts.length > 0) {
        const extractedHashes = callsData.receipts
          .map((receipt) => receipt.transactionHash)
          .filter((hash): hash is `0x${string}` => !!hash);

        const mainTxHash = extractedHashes[extractedHashes.length - 1];

        return {
          txHash: mainTxHash,
          allTxHashes: extractedHashes,
        };
      }

      return { txHash: undefined, allTxHashes: [] };
    }
    const extractedHashes: `0x${string}`[] = [];

    if (callsCount === 1) {
      // Single call - transaction hash is the first 66 characters
      const hash = result.id.slice(0, 66) as `0x${string}`;
      extractedHashes.push(hash);
    } else if (callsCount > 1) {
      // Multiple calls - transaction hashes are concatenated
      // Each transaction hash is 64 hex characters (32 bytes)
      for (let i = 0; i < callsCount; i++) {
        const hashStartIndex = 2 + i * 64; // 2 for '0x' prefix, 64 hex chars per hash
        const hashEndIndex = hashStartIndex + 64;
        const hash = `0x${result.id.slice(
          hashStartIndex,
          hashEndIndex
        )}` as `0x${string}`;
        extractedHashes.push(hash);
      }
    }

    // Return the last transaction hash (main transaction we want to track)
    const mainTxHash = extractedHashes[extractedHashes.length - 1];

    return {
      txHash: mainTxHash,
      allTxHashes: extractedHashes,
    };
  }, [result?.id, callsCount, enabled, isNativeSendCalls, callsData]);

  const {
    isLoading: isTxLoading,
    isSuccess: isTxSuccess,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    query: {
      enabled: !!txHash && enabled && !isNativeSendCalls,
    },
  });

  // Memoize native status calculations to ensure they update when callsData changes
  const { isNativeLoading, isNativeSuccess, isNativeError } = useMemo(() => {
    return {
      isNativeLoading: isNativeSendCalls && callsData?.status === 'pending',
      isNativeSuccess: isNativeSendCalls && callsData?.status === 'success',
      isNativeError: isNativeSendCalls && callsData?.status === 'failure',
    };
  }, [isNativeSendCalls, callsData?.status]);

  const isLoading = isNativeSendCalls ? isNativeLoading : isTxLoading;
  const isSuccess = isNativeSendCalls ? isNativeSuccess : isTxSuccess;

  // Fix nested ternary by using clearer conditional logic
  let error: Error | null = null;
  if (isNativeSendCalls) {
    error = isNativeError ? callsError : null;
  } else {
    error = txError;
  }

  return {
    txHash,
    isLoading,
    isSuccess,
    isError: !!error,
    error,
    allTxHashes,
  };
}
