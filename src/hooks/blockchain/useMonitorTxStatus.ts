import { useEffect } from 'react';
import { useTransactionReceipt } from 'wagmi';

interface UseMonitorTxStatusProps {
  hash?: `0x${string}`;
  chainId?: number;
  onLoading?: (isLoading: boolean) => void;
  onSuccess?: (
    receipt: ReturnType<typeof useTransactionReceipt>['data']
  ) => void;
  onError?: (error: Error) => void;
}

/**
 * Simple hook to monitor transaction status
 * Calls callbacks when transaction state changes
 */
export function useMonitorTxStatus({
  hash,
  chainId,
  onLoading,
  onSuccess,
  onError,
}: UseMonitorTxStatusProps) {
  const {
    data: receipt,
    isSuccess,
    isPending,
    error,
  } = useTransactionReceipt({
    hash,
    chainId,
    query: {
      enabled: !!hash && chainId !== undefined,
    },
  });

  // Handle loading state
  useEffect(() => {
    if (hash && isPending) {
      onLoading?.(true);
    }
  }, [hash, isPending, onLoading]);

  // Handle success
  useEffect(() => {
    if (isSuccess && receipt) {
      onLoading?.(false);
      onSuccess?.(receipt);
    }
  }, [isSuccess, receipt, onLoading, onSuccess]);

  // Handle error
  useEffect(() => {
    if (error) {
      onLoading?.(false);
      onError?.(error);
    }
  }, [error, onLoading, onError]);

  return {
    receipt,
    isSuccess,
    isPending: hash && isPending,
    error,
  };
}
