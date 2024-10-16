import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { useAccount, useReadContracts } from 'wagmi';

import { MarketContext } from '~/lib/context/MarketProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { PositionKind } from '~/lib/interfaces/interfaces';

interface Positions {
  liquidityPositions: FoilPosition[];
  tradePositions: FoilPosition[];
}

interface AddEditPositionContextType {
  nftId: number;
  setNftId: (id: number) => void;
  positions: Positions;
  refreshPositions: () => Promise<void>;
  isLoading: boolean;
}

const AddEditPositionContext = createContext<
  AddEditPositionContextType | undefined
>(undefined);

export const AddEditPositionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [nftId, setNftId] = useState(0);
  const { address } = useAccount();
  const {
    tokenIds,
    refetch: refetchTokenIds,
    isLoadingBalance,
    isRefetchingBalance,
    isLoadingContracts,
  } = useTokenIdsOfOwner(address as `0x${string}`);
  const {
    foilData,
    address: marketAddress,
    chainId,
  } = useContext(MarketContext);

  const {
    data: positionsData,
    refetch: refetchPositions,
    isLoading: isLoadingPositions,
    isRefetching: isRefetchingPositions,
  } = useReadContracts({
    contracts: tokenIds.map((i) => ({
      abi: foilData.abi,
      address: marketAddress as `0x${string}`,
      functionName: 'getPosition',
      chainId,
      args: [i],
    })),
  });

  const positions: Positions = React.useMemo(() => {
    const _positions: Positions = {
      liquidityPositions: [],
      tradePositions: [],
    };
    if (!positionsData) return _positions;

    for (const resp of positionsData) {
      const position = resp.result as FoilPosition;
      if (position.kind === PositionKind.Liquidity) {
        _positions.liquidityPositions.push(position);
      } else if (position.kind === PositionKind.Trade) {
        _positions.tradePositions.push(position);
      }
    }
    return _positions;
  }, [positionsData]);

  const refreshPositions = useCallback(async () => {
    await refetchTokenIds();
    await refetchPositions();
  }, [refetchTokenIds, refetchPositions]);

  const isLoading = useMemo(() => {
    return (
      isLoadingBalance ||
      isLoadingContracts ||
      isLoadingPositions ||
      isRefetchingBalance ||
      isRefetchingPositions
    );
  }, [
    isLoadingBalance,
    isLoadingContracts,
    isLoadingPositions,
    isRefetchingBalance,
    isRefetchingPositions,
  ]);

  return (
    <AddEditPositionContext.Provider
      value={{
        nftId,
        setNftId,
        positions,
        refreshPositions,
        isLoading,
      }}
    >
      {children}
    </AddEditPositionContext.Provider>
  );
};

export const useAddEditPosition = () => {
  const context = useContext(AddEditPositionContext);
  if (context === undefined) {
    throw new Error(
      'useAddEditPosition must be used within a AddEditPositionProvider'
    );
  }
  return context;
};
