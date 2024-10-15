import { useToast } from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import type { Pool } from '@uniswap/v3-sdk';
import type { ReactNode } from 'react';
import type React from 'react';
import { createContext, useEffect, useState } from 'react';
import { formatEther } from 'viem';
import * as Chains from 'viem/chains';
import type { Chain } from 'viem/chains';
import { useReadContract } from 'wagmi';

import useFoilDeployment from '../components/foil/useFoilDeployment';
import { API_BASE_URL, BLANK_MARKET } from '../constants/constants';
import erc20ABI from '../erc20abi.json';
import { useUniswapPool } from '../hooks/useUniswapPool';
import type { EpochParams } from '../interfaces/interfaces';
import { renderContractErrorToast } from '../util/util';

const gweiToEther = (gweiValue: bigint): string => {
  // First, convert gwei to wei (multiply by 10^9)
  const weiValue = gweiValue * BigInt(1e9);
  // Then use formatEther to convert wei to ether
  return formatEther(weiValue);
};

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
  foilData: any;
  chainId: number;
  error?: string;
  liquidity: number;
  owner: string;
  refetchUniswapData: () => void;
  stEthPerToken: number | undefined;
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
  const toast = useToast();
  const [state, setState] = useState<MarketContextType>(BLANK_MARKET);

  const { foilData } = useFoilDeployment(chainId);

  // Custom hooks for data fetching
  const { data: price } = useQuery({
    queryKey: ['averagePrice', `${state.chainId}:${state.address}`],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/prices/index?contractId=${state.chainId}:${state.address}&epochId=${state.epoch}`
      );
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      return data.length > 0 ? data[data.length - 1].price : null;
    },
    enabled: state.chainId !== 0,
    refetchInterval: 60000,
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
    }));
  }, [chainId, address, epoch]);

  // This will need to be abstracted
  const stEthPerTokenResult = useReadContract({
    chainId,
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
    address: state.collateralAsset as `0x${string}`,
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
    if (price && stEthPerTokenResult.data) {
      const stEthPerToken = Number(
        gweiToEther(stEthPerTokenResult.data as bigint)
      );

      const averageResourcePriceinWstEth = price.average / stEthPerToken;

      setState((currentState) => ({
        ...currentState,
        averagePrice: averageResourcePriceinWstEth,
        stEthPerToken,
      }));
    }
  }, [price, stEthPerTokenResult.data]);

  useEffect(() => {
    setState((currentState) => ({
      ...currentState,
      foilData: { address, abi: foilData.abi },
    }));
  }, [foilData]);

  useEffect(() => {
    if (marketViewFunctionResult.error) {
      renderContractErrorToast(
        marketViewFunctionResult.error,
        toast,
        'Unable to get market data'
      );
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
      const epochParams: EpochParams = marketViewFunctionResult.data[2];
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
      setState((currentState) => ({
        ...currentState,
        startTime: epochViewFunctionResult?.data[0],
        endTime: epochViewFunctionResult?.data[1],
        poolAddress: epochViewFunctionResult?.data[2],
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
