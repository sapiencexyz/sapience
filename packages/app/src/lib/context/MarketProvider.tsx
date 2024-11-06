import { useQuery } from '@tanstack/react-query';
import type { Pool } from '@uniswap/v3-sdk';
import axios from 'axios';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import * as Chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import { useReadContract } from 'wagmi';

import useFoilDeployment from '../components/foil/useFoilDeployment';
import {
  API_BASE_URL,
  BLANK_MARKET,
  DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS,
} from '../constants/constants';
import erc20ABI from '../erc20abi.json';
import { useUniswapPool } from '../hooks/useUniswapPool';
import type { EpochParams } from '../interfaces/interfaces';
import { gweiToEther } from '../util/util';
import { useToast } from '~/hooks/use-toast';

// Types and Interfaces
export interface MarketContextType {
  chain?: Chain;
  address: string;
  collateralAsset: string;
  collateralAssetTicker: string;
  averagePrice: number;
  startTime: number;
  endTime: number;
  epochParams: EpochParams;
  poolAddress: `0x${string}`;
  pool: Pool | null;
  collateralAssetDecimals: number;
  epoch: number;
  epochSettled: boolean;
  settlementPrice?: bigint;
  foilData: any;
  chainId: number;
  error?: string;
  liquidity: number;
  owner: string;
  refetchUniswapData: () => void;
  stEthPerToken: number | undefined;
  useMarketUnits: boolean;
  setUseMarketUnits: (useMarketUnits: boolean) => void;
}

interface MarketProviderProps {
  chainId: number;
  address: string;
  epoch: number;
  children: ReactNode;
}

// Context creation
export const MarketContext = createContext<MarketContextType>(BLANK_MARKET);

// Main component
export const MarketProvider: React.FC<MarketProviderProps> = ({
  chainId,
  address,
  children,
  epoch,
}) => {
  const { toast } = useToast();
  const [state, setState] = useState<MarketContextType>(BLANK_MARKET);
  const [useMarketUnits, setUseMarketUnits] = useState(false);

  const { foilData } = useFoilDeployment(chainId);

  // Custom hooks for data fetching
  const { data: latestPrice } = useQuery({
    queryKey: ['latestPrice', `${state.chainId}:${state.address}`],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/index/latest?contractId=${state.chainId}:${state.address}&epochId=${state.epoch}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.price;
    },
    enabled: state.chainId !== 0 && state.epoch !== 0,
    refetchInterval: () => {
      const currentTime = Math.floor(Date.now() / 1000); // Convert to Unix timestamp
      if (state.averagePrice && currentTime > state.endTime) {
        return false;
      }
      return 60000;
    },
  });

  const marketViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: state.address as `0x${string}`,
    functionName: 'getMarket',
  }) as any;

  const epochViewFunctionResult = useReadContract({
    chainId,
    abi: foilData.abi,
    address: state.address as `0x${string}`,
    functionName: 'getEpoch',
    args: [epoch],
  }) as any;

  const collateralTickerFunctionResult = useReadContract({
    chainId,
    abi: erc20ABI,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'symbol',
  });

  const collateralDecimalsFunctionResult = useReadContract({
    chainId,
    abi: erc20ABI,
    address: state.collateralAsset as `0x${string}`,
    functionName: 'decimals',
  });

  const { pool, liquidity, refetchUniswapData } = useUniswapPool(
    chainId,
    state.poolAddress
  );

  // Effect hooks
  useEffect(() => {
    const chain = Object.entries(Chains).find((chainOption) => {
      if (chainId === 13370 && chainOption[0] === 'localhost') {
        return true;
      }
      return chainOption[1].id === chainId;
    });

    if (chain === undefined) {
      return;
    }

    setState((currentState) => ({
      ...currentState,
      chain: chain[1] as any,
      address,
      epoch,
      chainId,
      useMarketUnits,
      setUseMarketUnits,
    }));
  }, [chainId, address, epoch, useMarketUnits, setUseMarketUnits]);

  // This will need to be abstracted
  const stEthPerTokenResult = useReadContract({
    chainId: chainId === Chains.cannon.id ? Chains.sepolia.id : chainId,
    abi: [
      {
        inputs: [],
        name: 'stEthPerToken',
        outputs: [
          {
            internalType: 'uint256',
            name: '',
            type: 'uint256',
          },
        ],
        stateMutability: 'view',
        type: 'function',
      },
    ],
    address:
      chainId === Chains.cannon.id
        ? DUMMY_LOCAL_COLLATERAL_ASSET_ADDRESS
        : (state.collateralAsset as `0x${string}`),
    functionName: 'stEthPerToken',
  });

  useEffect(() => {
    if (stEthPerTokenResult.data) {
      setState((currentState) => ({
        ...currentState,
        stEthPerToken: Number(gweiToEther(stEthPerTokenResult.data as bigint)),
      }));
    }
  }, [stEthPerTokenResult.data]);

  useEffect(() => {
    const updateSettledStEthPerToken = async () => {
      const response = await axios.get(
        `${API_BASE_URL}/getStEthPerTokenAtTimestamp?chainId=${state.chainId}&collateralAssetAddress=${state.collateralAsset}&endTime=${state.endTime}`
      );
      console.log('updated stEthPerToken', response.data);
      const stEthPerToken = BigInt(response.data.stEthPerToken);
      setState((currentState) => ({
        ...currentState,
        stEthPerToken: Number(gweiToEther(stEthPerToken)),
      }));
    };

    const currentTime = Math.floor(Date.now() / 1000);
    if (
      state.endTime &&
      state.endTime < currentTime &&
      state.chainId &&
      state.collateralAsset
    ) {
      updateSettledStEthPerToken();
    }
  }, [state.endTime, state.chainId, state.collateralAsset]);

  useEffect(() => {
    console.log('latestPrice =', latestPrice);
    if (latestPrice !== undefined && stEthPerTokenResult.data) {
      const stEthPerToken = Number(
        gweiToEther(stEthPerTokenResult.data as bigint)
      );

      const averageResourcePriceinWstEth = latestPrice / stEthPerToken;

      setState((currentState) => ({
        ...currentState,
        averagePrice: averageResourcePriceinWstEth,
        stEthPerToken,
      }));
    }
  }, [latestPrice, stEthPerTokenResult.data]);

  useEffect(() => {
    setState((currentState) => ({
      ...currentState,
      foilData: { address, abi: foilData.abi },
    }));
  }, [foilData]);

  useEffect(() => {
    if (marketViewFunctionResult.error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description:
          marketViewFunctionResult.error.message || 'Unable to get market data',
      });
      setState((prev) => ({
        ...prev,
        error: marketViewFunctionResult.error?.message,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        error: undefined,
      }));
    }
  }, [marketViewFunctionResult.error, toast]);

  useEffect(() => {
    if (marketViewFunctionResult.data !== undefined) {
      console.log(
        'marketViewFunctionResult data: ',
        marketViewFunctionResult.data
      );
      const epochParams: EpochParams = marketViewFunctionResult.data[4];
      setState((currentState) => ({
        ...currentState,
        owner: marketViewFunctionResult?.data[0],
        collateralAsset: marketViewFunctionResult?.data[1],
        epochParams,
      }));
    }
  }, [marketViewFunctionResult.data]);

  useEffect(() => {
    if (epochViewFunctionResult.data !== undefined) {
      console.log(
        'epochViewFunctionResult data: ',
        epochViewFunctionResult.data
      );
      setState((currentState) => ({
        ...currentState,
        startTime: epochViewFunctionResult.data[0],
        endTime: epochViewFunctionResult.data[1],
        poolAddress: epochViewFunctionResult.data[2],
        epochSettled: epochViewFunctionResult.data[7],
        settlementPrice: epochViewFunctionResult.data[8],
      }));
    }
  }, [epochViewFunctionResult.data]);

  useEffect(() => {
    if (pool) {
      setState((currentState) => ({
        ...currentState,
        pool,
        liquidity: Number(liquidity),
      }));
    }
  }, [pool, liquidity]);

  useEffect(() => {
    if (collateralTickerFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        collateralAssetTicker: collateralTickerFunctionResult.data as string,
      }));
    }
  }, [collateralTickerFunctionResult.data]);

  useEffect(() => {
    if (collateralDecimalsFunctionResult.data !== undefined) {
      setState((currentState) => ({
        ...currentState,
        collateralAssetDecimals:
          collateralDecimalsFunctionResult.data as number,
      }));
    }
  }, [collateralDecimalsFunctionResult.data]);

  return (
    <MarketContext.Provider value={{ ...state, refetchUniswapData }}>
      {children}
    </MarketContext.Provider>
  );
};
