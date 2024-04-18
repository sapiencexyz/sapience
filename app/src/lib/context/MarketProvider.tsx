import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import * as Chains from 'viem/chains';
import { useReadContract } from 'wagmi';

import CollateralAsset from '../../../deployments/CollateralAsset/MintableToken.json';
import Foil from '../../../deployments/Foil.json';

interface MarketContextType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain?: any;
  address: string;
  collateralAsset: string;
  collateralAssetTicker: string;
}

interface MarketProviderProps {
  chainId: number;
  address: string;
  children: ReactNode;
}

export const MarketContext = createContext<MarketContextType>({
  chain: {},
  address: '0x0000',
  collateralAsset: '0x0000',
  collateralAssetTicker: '',
});

export const MarketProvider: React.FC<MarketProviderProps> = ({
  chainId,
  address,
  children,
}) => {
  const [state, setState] = useState<MarketContextType>({
    chain: {},
    address: '0x0000',
    collateralAsset: '0x0000',
    collateralAssetTicker: '',
  });

  useEffect(() => {
    const chain = Object.entries(Chains).find(
      (chainOption) => chainOption[1].id === chainId
    );

    if (chain === undefined) {
      return;
    }

    setState({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chain: chain[1] as any,
      address,
      collateralAsset: '0x0000',
      collateralAssetTicker: '',
    });
  }, [chainId, address]);

  const marketViewFunctionResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getEpoch',
  });

  useEffect(() => {
    if (marketViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        ...Object(marketViewFunctionResult.data),
      }));
    }
  }, [marketViewFunctionResult.data]);

  const collateralTickerFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'symbol',
  });

  useEffect(() => {
    if (collateralTickerFunctionResult.data !== undefined) {
      setState((currentState) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(currentState as any),
        collateralAssetTicker: collateralTickerFunctionResult.data,
      }));
    }
  }, [collateralTickerFunctionResult.data]);

  console.log(state)

  return (
    <MarketContext.Provider value={state}>{children}</MarketContext.Provider>
  );
};
