import { useReadContract } from 'wagmi';
import type { Address, Abi } from 'viem';

// Import the ABI definition
import FoilAbi from '../../../../protocol/deployments/Foil.json'; 

// Define the structure of the data returned by getLatestEpoch for type safety
// This should match the tuple structure [epochData, marketParams] from the ABI
type GetLatestEpochReturnType = readonly [
  { 
    epochId: bigint; 
    // Include other fields from EpochData if needed elsewhere, 
    // otherwise just epochId is sufficient for type checking
    startTime: bigint;
    endTime: bigint;
    pool: Address;
    ethToken: Address;
    gasToken: Address;
    minPriceD18: bigint;
    maxPriceD18: bigint;
    baseAssetMinPriceTick: number;
    baseAssetMaxPriceTick: number;
    settled: boolean;
    settlementPriceD18: bigint;
    assertionId: `0x${string}`;
    claimStatement: `0x${string}`;
  },
  unknown // Assuming we don't need marketParams details here
];


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
  const { 
    data: latestEpochData, 
    error: readError, 
    isLoading: isReadingEpoch,
    refetch: refetchLatestEpoch, // Expose refetch if needed
  } = useReadContract({
    address: marketGroupAddress,
    abi: FoilAbi.abi as Abi, // Cast ABI to Viem's Abi type
    functionName: 'getLatestEpoch',
    chainId: chainId,
    // Enable the query only when address and chainId are provided
    // queryKey: ['latestEpoch', chainId, marketGroupAddress], // Removed - useReadContract manages its cache keys
    // enabled: !!marketGroupAddress && typeof chainId === 'number', // Removed - handled by conditional address/chainId
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