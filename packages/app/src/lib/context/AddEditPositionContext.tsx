import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAccount, useReadContracts } from 'wagmi';

import { MarketContext } from '~/lib/context/MarketProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { PositionKind } from '~/lib/interfaces/interfaces';

interface AddEditPositionContextType {
  nftId: number;
  setNftId: (id: number) => void;
  tokenIds: number[];
  isLps: boolean[];
  refreshPositions: () => Promise<void>;
}

const AddEditPositionContext = createContext<
  AddEditPositionContextType | undefined
>(undefined);

export const AddEditPositionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [nftId, setNftId] = useState(0);
  const { address } = useAccount();
  const { tokenIds, refetch: refetchTokenIds } = useTokenIdsOfOwner(
    address as `0x${string}`
  );
  const {
    foilData,
    address: marketAddress,
    chainId,
  } = useContext(MarketContext);

  const { data: positionsData, refetch: refetchPositions } = useReadContracts({
    contracts: tokenIds.map((i) => ({
      abi: foilData.abi,
      address: marketAddress as `0x${string}`,
      functionName: 'getPosition',
      chainId,
      args: [i],
    })),
  });

  const isLps = React.useMemo(() => {
    if (!positionsData) return [];
    return positionsData.map((resp) => {
      const position = resp.result as FoilPosition;
      return position.kind === PositionKind.Liquidity;
    });
  }, [positionsData]);

  const refreshPositions = useCallback(async () => {
    await refetchTokenIds();
    await refetchPositions();
  }, [refetchTokenIds, refetchPositions]);

  return (
    <AddEditPositionContext.Provider
      value={{ nftId, setNftId, tokenIds, isLps, refreshPositions }}
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
