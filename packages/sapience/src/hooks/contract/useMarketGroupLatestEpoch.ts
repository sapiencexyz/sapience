import { useFoilAbi } from '@sapience/ui/hooks/useFoilAbi';
import type { Address, Abi } from 'viem';
import { useReadContract } from 'wagmi';

/**
 * Hook to fetch the latest epoch ID for a specific market group contract.
 *
 * @param marketGroupAddress The address of the deployed market group contract.
 * @param chainId The chain ID where the contract is deployed.
 * @returns An object containing the latest epoch ID, loading state, and error state.
 */
export const useMarketGroupLatestEpoch = (
  marketGroupAddress?: Address,
  chainId?: number
) => {
  const { abi } = useFoilAbi();

  const {
    data: latestEpochData,
    error: readError,
    isLoading: isReadingEpoch,
    refetch: refetchLatestEpoch, // Expose refetch if needed
  } = useReadContract({
    address: marketGroupAddress,
    abi: abi as Abi, // Cast ABI to Viem's Abi type
    functionName: 'getLatestEpoch',
    chainId,
  });

  // Extract the epochId from the returned tuple
  const latestEpochId =
    latestEpochData &&
    Array.isArray(latestEpochData) &&
    latestEpochData.length > 0 &&
    typeof latestEpochData[0] === 'object' &&
    latestEpochData[0] !== null &&
    'epochId' in latestEpochData[0]
      ? (latestEpochData[0] as { epochId: bigint }).epochId // Type assertion after checks
      : undefined;

  return {
    latestEpochId, // bigint | undefined
    isLoading: isReadingEpoch,
    error: readError,
    refetch: refetchLatestEpoch, // Optionally return refetch function
  };
};
