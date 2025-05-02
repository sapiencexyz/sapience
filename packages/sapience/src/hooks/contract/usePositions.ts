import { times } from 'lodash';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Abi } from 'viem';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';

// Define the enum based on the protocol definition where Liquidity = 1, Trade = 2
export enum PositionKind {
  Unknown = 0,
  Liquidity = 1,
  Trade = 2,
}

// Position interface based on the Solidity struct
export interface FoilPosition {
  id: bigint; // NFT ID
  kind: PositionKind;
  epochId: bigint; // Same as marketId
  depositedCollateralAmount: bigint;
  borrowedVEth: bigint;
  borrowedVGas: bigint;
  vEthAmount: bigint;
  vGasAmount: bigint;
  uniswapPositionId: bigint;
  isSettled: boolean;
}

interface UsePositionsProps {
  marketAddress?: `0x${string}`;
  marketId?: string | number;
  chainId?: number;
  foilAbi: Abi;
  enabled?: boolean;
}

export interface UsePositionsResult {
  lpPositions: Record<string, FoilPosition>;
  traderPositions: Record<string, FoilPosition>;
  lpPositionsArray: FoilPosition[];
  traderPositionsArray: FoilPosition[];
  getAllPositions: () => FoilPosition[];
  getPositionById: (id: string | number) => FoilPosition | undefined;
  isLoading: boolean;
  isRefetching: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and return a user's positions, optionally filtered by marketId
 * @param marketAddress - The address of the market contract
 * @param marketId - Optional market ID to filter positions by
 * @param chainId - The chain ID where the market exists
 * @param foilAbi - The ABI of the Foil contract
 * @param enabled - Whether to enable the queries
 * @returns {UsePositionsResult} Object containing:
 *   - lpPositions: Object map of liquidity positions by position ID
 *   - traderPositions: Object map of trader positions by position ID
 *   - lpPositionsArray: Array of liquidity positions
 *   - traderPositionsArray: Array of trader positions
 *   - getAllPositions: Function to get all positions as a single array
 *   - getPositionById: Function to retrieve a specific position by ID
 *   - isLoading: Whether any of the queries are loading
 *   - isRefetching: Whether any of the queries are refetching
 *   - refetch: Function to refetch all data
 */
export function usePositions({
  marketAddress,
  marketId,
  chainId,
  foilAbi,
  enabled = true,
}: UsePositionsProps): UsePositionsResult {
  const { address, isConnected } = useAccount();
  const [tokenIds, setTokenIds] = useState<number[]>([]);

  // 1. Fetch the balance of tokens the user owns
  const {
    data: balanceData,
    isLoading: isLoadingBalance,
    isRefetching: isRefetchingBalance,
    refetch: refetchBalance,
  } = useReadContract({
    abi: foilAbi,
    address: marketAddress,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId,
    query: {
      enabled:
        enabled && isConnected && !!address && !!marketAddress && !!chainId,
    },
  });

  // 2. Fetch token IDs using tokenOfOwnerByIndex
  const {
    data: tokenIdsData,
    isLoading: isLoadingTokenIds,
    isRefetching: isRefetchingTokenIds,
    refetch: refetchTokenIds,
  } = useReadContracts({
    contracts: useMemo(() => {
      const tokenBalance = balanceData ? Number(balanceData.toString()) : 0;

      return times(tokenBalance).map((index) => ({
        abi: foilAbi,
        address: marketAddress,
        functionName: 'tokenOfOwnerByIndex',
        args: [address as `0x${string}`, index],
        chainId,
      }));
    }, [balanceData, foilAbi, marketAddress, address, chainId]),
    query: {
      enabled:
        enabled && isConnected && !!balanceData && Number(balanceData) > 0,
    },
  });

  // Update tokenIds state when token IDs are fetched
  useEffect(() => {
    if (tokenIdsData) {
      const ids: number[] = [];
      for (const resp of tokenIdsData) {
        if (resp.result) {
          ids.push(Number(resp.result.toString()));
        }
      }
      setTokenIds(ids);
    }
  }, [tokenIdsData]);

  // 3. Fetch position data for each token ID
  const {
    data: positionsData,
    isLoading: isLoadingPositions,
    isRefetching: isRefetchingPositions,
    refetch: refetchPositions,
  } = useReadContracts({
    contracts: useMemo(() => {
      return tokenIds.map((tokenId) => ({
        abi: foilAbi,
        address: marketAddress,
        functionName: 'getPosition',
        args: [tokenId],
        chainId,
      }));
    }, [tokenIds, foilAbi, marketAddress, chainId]),
    query: {
      enabled: enabled && tokenIds.length > 0 && !!marketAddress,
    },
  });

  // Process and categorize positions
  const {
    lpPositions,
    traderPositions,
    lpPositionsArray,
    traderPositionsArray,
  } = useMemo(() => {
    const result = {
      lpPositions: {} as Record<string, FoilPosition>,
      traderPositions: {} as Record<string, FoilPosition>,
      lpPositionsArray: [] as FoilPosition[],
      traderPositionsArray: [] as FoilPosition[],
    };

    if (!positionsData) return result;

    for (const response of positionsData) {
      // eslint-disable-next-line no-continue
      if (!response.result) continue;

      const position = response.result as unknown as FoilPosition;
      const positionId = position.id.toString();

      // If marketId is provided, filter positions by that marketId
      if (
        marketId !== undefined &&
        position.epochId !== undefined &&
        position.epochId.toString() !== marketId.toString()
      ) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // Categorize by position kind
      if (position.kind === PositionKind.Liquidity) {
        result.lpPositions[positionId] = position;
        result.lpPositionsArray.push(position);
      } else if (position.kind === PositionKind.Trade) {
        result.traderPositions[positionId] = position;
        result.traderPositionsArray.push(position);
      }
    }

    return result;
  }, [positionsData, marketId]);

  // Helper functions
  const getAllPositions = useCallback(() => {
    return [...lpPositionsArray, ...traderPositionsArray];
  }, [lpPositionsArray, traderPositionsArray]);

  const getPositionById = useCallback(
    (id: string | number) => {
      const positionId = id.toString();
      return lpPositions[positionId] || traderPositions[positionId];
    },
    [lpPositions, traderPositions]
  );

  // Combine refetch functions
  const refetch = async () => {
    await refetchBalance();
    if (Number(balanceData) > 0) {
      await refetchTokenIds();
      if (tokenIds.length > 0) {
        await refetchPositions();
      }
    }
  };

  // Determine loading state
  const isLoading = isLoadingBalance || isLoadingTokenIds || isLoadingPositions;

  const isRefetching =
    isRefetchingBalance || isRefetchingTokenIds || isRefetchingPositions;

  return {
    lpPositions,
    traderPositions,
    lpPositionsArray,
    traderPositionsArray,
    getAllPositions,
    getPositionById,
    isLoading,
    isRefetching,
    refetch,
  };
}
