import type { Abi } from 'viem';
import { useReadContract } from 'wagmi';

interface UseGetEpochWithLegacyFallbackProps {
  chainId: number;
  contractAddress?: `0x${string}`;
  marketId?: number;
  primaryAbi?: Abi | readonly unknown[];
  legacyAbi?: Abi | readonly unknown[];
  enabled?: boolean;
}

export function useGetEpochWithLegacyFallback({
  chainId,
  contractAddress,
  marketId,
  primaryAbi,
  legacyAbi,
  enabled = true,
}: UseGetEpochWithLegacyFallbackProps) {
  const primaryCall = useReadContract({
    chainId,
    abi: primaryAbi,
    address: contractAddress,
    functionName: 'getEpoch',
    args: [marketId ?? 0],
    query: {
      enabled:
        enabled && !!contractAddress && marketId !== undefined && !!primaryAbi,
    },
  });

  const fallbackIsEnabled =
    enabled &&
    !!contractAddress &&
    marketId !== undefined &&
    !!legacyAbi &&
    !!primaryCall.error &&
    !primaryCall.data;

  const fallbackCall = useReadContract({
    chainId,
    abi: legacyAbi,
    address: contractAddress,
    functionName: 'getEpoch',
    args: [marketId ?? 0],
    query: {
      enabled: fallbackIsEnabled,
    },
  });

  // Prioritize primary data, then fallback data
  const data: any = primaryCall.data || fallbackCall.data;

  // Determine loading state: true if primary is loading, or if primary failed and fallback is loading.
  const isLoading =
    primaryCall.isLoading ||
    (primaryCall.isError && !primaryCall.data && fallbackCall.isLoading);
  const isFetching =
    primaryCall.isFetching ||
    (primaryCall.isError && !primaryCall.data && fallbackCall.isFetching);

  // Determine error state
  const error = determineError(primaryCall, fallbackCall, fallbackIsEnabled);

  const refetch = async () => {
    // Refetch primary first
    const primaryResult = await primaryCall.refetch();
    // Check if fallback should be refetched based on the same logic as its `enabled` query option
    const shouldRefetchFallback =
      enabled &&
      !!contractAddress &&
      marketId !== undefined &&
      !!legacyAbi &&
      !!primaryResult.error &&
      !primaryResult.data;
    if (shouldRefetchFallback) {
      await fallbackCall.refetch();
    }
  };

  return {
    data,
    isLoading,
    isFetching,
    error,
    refetch,
    // Detailed states for more granular control if needed by the component
    isPrimaryLoading: primaryCall.isLoading,
    isPrimaryFetching: primaryCall.isFetching,
    isPrimarySuccess: primaryCall.isSuccess,
    primaryError: primaryCall.error,
    isFallbackLoading: fallbackCall.isLoading,
    isFallbackFetching: fallbackCall.isFetching,
    isFallbackSuccess: fallbackCall.isSuccess,
    fallbackError: fallbackCall.error,
  };
}

function determineError(
  primaryCall: any,
  fallbackCall: any,
  fallbackIsEnabled: boolean
): Error | null {
  let error: Error | null = null;
  if (primaryCall.isError && !fallbackCall.data) {
    // Primary call failed, and fallback has no data yet
    if (fallbackCall.isError) {
      error = fallbackCall.error; // Fallback also failed
    } else if (
      !fallbackCall.isLoading &&
      !fallbackCall.isFetching &&
      fallbackIsEnabled
    ) {
      // Fallback is not loading/fetching but was enabled, primary error is the one to show.
      error = primaryCall.error;
    } else if (!fallbackIsEnabled && primaryCall.error) {
      // Fallback was not enabled, so primary error is definitely the one.
      error = primaryCall.error;
    }
    // If fallback is loading/fetching, or was not enabled but primary didn't error, error remains null or is handled by primary success.
  } else if (primaryCall.data && fallbackCall.isError && fallbackIsEnabled) {
    // Primary has data, but an enabled fallback call errored.
    // Depending on requirements, you might want to log fallbackCall.error but not set the main error state.
    // For now, if primary data is available, we don't surface fallback error as the main 'error'.
    error = null;
  }
  return error;
}
