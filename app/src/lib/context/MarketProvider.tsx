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
  address: '',
  collateralAsset: '',
  collateralAssetTicker: '',
});

export const MarketProvider: React.FC<MarketProviderProps> = ({
  chainId,
  address,
  children,
}) => {
  const [state, setState] = useState<MarketContextType>({
    chain: {},
    address: '',
    collateralAsset: '',
    collateralAssetTicker: '',
  });

  // Set chainId and address from the URL
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
      collateralAsset: '',
      collateralAssetTicker: '',
    });
  }, [chainId, address]);

  // Get data about the market from Foil
  const marketViewFunctionResult = useReadContract({
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getMarket',
  });

  useEffect(() => {
    if (marketViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        endTime: marketViewFunctionResult?.data[0],
        uniswapPositionManager: marketViewFunctionResult?.data[1],
        resolver: marketViewFunctionResult?.data[2],
        collateralAsset: marketViewFunctionResult?.data[3],
        baseAssetMinPrice: marketViewFunctionResult?.data[4].toString(),
        baseAssetMaxPrice: marketViewFunctionResult?.data[5].toString(),
        feeRate: marketViewFunctionResult?.data[6],
      }));
    }
  }, [marketViewFunctionResult.data]);

  // Get data about the market from Uniswap

  // Fetch Collateral Ticker
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
