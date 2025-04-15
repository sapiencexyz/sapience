import { useReadContract } from 'wagmi';

export const useMarketInfo = (chainId?: number, address?: `0x${string}`, marketId?: number, abi?: any) => {
  if (!chainId || !address || !marketId || !abi || abi.length === 0) {
    return { data: null };
  }

  const { data } = useReadContract({
    chainId: chainId,
    abi: abi,
    address: address as `0x${string}`,
    functionName: 'getEpoch',
    args: [marketId],
  });

  console.log('LLL data', data)

  return { data };
};
