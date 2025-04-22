import { useToast } from '@foil/ui/hooks/use-toast';
import { useEffect } from 'react';
import { Abi, Address } from 'viem';
import { useReadContract } from 'wagmi';

// Define the types based on the provided structs
interface MarketData {
  epochId: bigint;
  startTime: bigint;
  endTime: bigint;
  pool: Address;
  ethToken: Address;
  gasToken: Address;
  minPriceD18: bigint;
  maxPriceD18: bigint;
  baseAssetMinPriceTick: number;
  baseAssetMaxPriceTick: number;
  settled: boolean;
  settlementPriceD18: bigint;
  assertionId: `0x${string}`;
}

interface MarketGroupParams {
  feeRate: number;
  assertionLiveness: bigint;
  bondAmount: bigint;
  bondCurrency: Address;
  uniswapPositionManager: Address;
  uniswapSwapRouter: Address;
  uniswapQuoter: Address;
  optimisticOracleV3: Address;
  claimStatement: `0x${string}`;
}

interface UseMarketResult {
  marketData: MarketData | undefined;
  marketGroupParams: MarketGroupParams | undefined;
  isLoading: boolean;
  error: Error | null;
}

interface UseMarketProps {
  marketAddress: Address;
  marketId: bigint;
  abi: Abi;
}

export function useMarketRead({
  marketAddress,
  marketId,
  abi,
}: UseMarketProps): UseMarketResult {
  const { toast } = useToast();

  const {
    data,
    isLoading,
    isError,
    error: contractError,
  } = useReadContract({
    address: marketAddress,
    abi,
    chainId: 8453,
    functionName: 'getEpoch',
    args: [marketId],
  });

  useEffect(() => {
    if (isError && contractError) {
      toast({
        title: 'Error loading market data',
        description: contractError.message,
        variant: 'destructive',
      });
    }
  }, [isError, contractError, toast]);

  // Extract the data from the result
  // Handle the tuple return type properly
  const result = data as [MarketData, MarketGroupParams] | undefined;
  const marketData = result?.[0];
  const marketGroupParams = result?.[1];

  return {
    marketData,
    marketGroupParams,
    isLoading,
    error: contractError,
  };
}
