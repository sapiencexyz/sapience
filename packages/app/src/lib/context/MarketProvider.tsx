import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import * as Chains from 'viem/chains';
import { useReadContract } from 'wagmi';

import CollateralAsset from '../../../deployments/CollateralAsset/MintableToken.json';
import Foil from '../../../deployments/Foil.json';

const API_BASE_URL = 'http://localhost:3001';

interface MarketContextType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain?: any;
  address: string;
  collateralAsset: string;
  collateralAssetTicker: string;
  averagePrice: number;
  startTime: number;
  endTime: number;
  prices?: Array<{ timestamp: number; value: number }>;
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
  averagePrice: 0,
  startTime: 0,
  endTime: 0,
  prices: [],
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
    averagePrice: 0,
    startTime: 0,
    endTime: 0,
    prices: [],
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
      averagePrice: 0,
      startTime: 0,
      endTime: 0,
      prices: [],
    });
  }, [chainId, address]);

  const contractId = `${chainId}:${address}`;

  // Fetch prices using React Query
  // TODO: filter by start and end timestamps
  const { data: price } = useQuery({
    queryKey: ['averagePrice', contractId],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/average?contractId=${contractId}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    },
    refetchInterval: 60000, // Refetch every 60 seconds
  });

  useEffect(() => {
    if (price) {
      setState((currentState) => ({
        ...currentState,
        averagePrice: price.average,
      }));
    }
  }, [price]);

  // Get data about the market from Foil
  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: Foil.abi,
    address: Foil.address as `0x${string}`,
    functionName: 'getMarket',
  });

  console.log("YOYOYO", marketViewFunctionResult.status, marketViewFunctionResult.data, marketViewFunctionResult.error, chainId)

  useEffect(() => {
    if (marketViewFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        startTime: marketViewFunctionResult?.data[0],
        endTime: marketViewFunctionResult?.data[1],
        uniswapPositionManager: marketViewFunctionResult?.data[2],
        resolver: marketViewFunctionResult?.data[3],
        collateralAsset: marketViewFunctionResult?.data[4],
        baseAssetMinPrice: marketViewFunctionResult?.data[5].toString(),
        baseAssetMaxPrice: marketViewFunctionResult?.data[6].toString(),
        feeRate: marketViewFunctionResult?.data[7],
        ethToken: marketViewFunctionResult?.data[8],
        gasToken: marketViewFunctionResult?.data[9],
        pool: marketViewFunctionResult?.data[10],
      }));
    }
  }, [marketViewFunctionResult.data]);

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

  return (
    <MarketContext.Provider value={state}>{children}</MarketContext.Provider>
  );
};
