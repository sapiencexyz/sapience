import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

import { API_BASE_URL } from '../constants/constants';

export interface Market {
  id: number;
  name: string;
  chainId: number;
  address: string;
  collateralAsset: string;
  epochs: Array<{
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
  }>;
  currentEpoch: {
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
  } | null;
  nextEpoch: {
    id: number;
    epochId: number;
    startTimestamp: number;
    endTimestamp: number;
  } | null;
  public: boolean;
}

interface MarketListContextType {
  markets: Market[];
  isLoading: boolean;
  error: Error | null;
}

const MarketListContext = createContext<MarketListContextType | undefined>(
  undefined
);

export const MarketListProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const {
    data: markets,
    isLoading,
    error,
  } = useQuery<Market[], Error>({
    queryKey: ['markets'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE_URL}/markets`);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const fetchedMarkets: Market[] = await response.json();

      const currentTimestamp = Math.floor(Date.now() / 1000);

      return fetchedMarkets.map((market) => {
        const sortedEpochs = [...market.epochs].sort(
          (a, b) => a.startTimestamp - b.startTimestamp
        );

        const currentEpoch =
          sortedEpochs.find(
            (epoch) =>
              epoch.startTimestamp <= currentTimestamp &&
              epoch.endTimestamp > currentTimestamp
          ) ||
          sortedEpochs[sortedEpochs.length - 1] ||
          null;

        const nextEpoch =
          sortedEpochs.find(
            (epoch) => epoch.startTimestamp > currentTimestamp
          ) ||
          sortedEpochs[sortedEpochs.length - 1] ||
          null;

        return {
          ...market,
          currentEpoch,
          nextEpoch,
        };
      });
    },
  });

  //

  return (
    <MarketListContext.Provider
      value={{ markets: markets || [], isLoading, error }}
    >
      {children}
    </MarketListContext.Provider>
  );
};

export const useMarketList = () => {
  const context = useContext(MarketListContext);
  if (context === undefined) {
    throw new Error('useMarketList must be used within a MarketListProvider');
  }
  return context;
};
