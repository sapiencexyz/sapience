import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAccount, useReadContracts } from 'wagmi';

import { MarketContext } from '~/lib/context/MarketProvider';
import { useTokenIdsOfOwner } from '~/lib/hooks/useTokenIdsOfOwner';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { PositionKind } from '~/lib/interfaces/interfaces';

interface LiquidityPositionContextType {
  nftId: number;
  setNftId: (id: number) => void;
  tokenIds: number[];
  isLps: boolean[];
  refreshPositions: () => Promise<void>;
}

const LiquidityPositionContext = createContext<
  LiquidityPositionContextType | undefined
>(undefined);

export const LiquidityPositionProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [nftId, setNftId] = useState(0);
  const { address } = useAccount();
  const { tokenIds, refetch: refetchTokenIds } = useTokenIdsOfOwner(
    address as `0x${string}`
  );
  const { foilData } = useContext(MarketContext);

  const { data: positionsData, refetch: refetchPositions } = useReadContracts({
    contracts: tokenIds.map((i) => ({
      abi: foilData.abi,
      address: foilData.address as `0x${string}`,
      functionName: 'getPosition',
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
    <LiquidityPositionContext.Provider
      value={{ nftId, setNftId, tokenIds, isLps, refreshPositions }}
    >
      {children}
    </LiquidityPositionContext.Provider>
  );
};

export const useLiquidityPosition = () => {
  const context = useContext(LiquidityPositionContext);
  if (context === undefined) {
    throw new Error(
      'useLiquidityPosition must be used within a LiquidityPositionProvider'
    );
  }
  return context;
};
