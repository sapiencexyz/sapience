import { useReadContract } from 'wagmi';

import useFoilDeployment from '../components/foil/useFoilDeployment';

export interface EpochData {
  minPriceD18: bigint;
  maxPriceD18: bigint;
  settlementPriceD18: bigint;
  settled: boolean;
  bondAmount: bigint;
}

export const useEpochData = (
  chainId: number,
  marketAddress: string,
  epochId: number
) => {
  const {
    foilData,
    loading: loadingFoilData,
    error: foilDataError,
  } = useFoilDeployment(chainId);

  const {
    data: epochData,
    isLoading: isLoadingEpochData,
    error: epochError,
  } = useReadContract({
    address: marketAddress as `0x${string}`,
    abi: foilData?.abi,
    functionName: 'getEpoch',
    args: [BigInt(epochId)],
    chainId,
    query: {
      enabled: !loadingFoilData && !foilDataError && !!foilData,
    },
  }) as any;

  const loading = loadingFoilData || isLoadingEpochData;
  const error = foilDataError || epochError;

  let data: EpochData | undefined;
  if (epochData) {
    const [epochInfo, marketParams] = epochData;
    data = {
      minPriceD18: epochInfo.minPriceD18,
      maxPriceD18: epochInfo.maxPriceD18,
      settlementPriceD18: epochInfo.settlementPriceD18,
      settled: epochInfo.settled,
      bondAmount: marketParams.bondAmount,
    };
  }

  return {
    data,
    loading,
    error,
  };
};
