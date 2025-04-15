import { useReadContracts } from 'wagmi';
import erc20ABI from '../abis/erc20abi.json';

export const useCollateralInfo = (chainId?: number, address?: `0x${string}`) => {
  if (!chainId || !address) {
    return { ticker: '', decimals: 0 };
  }

  const { data } = useReadContracts({
    contracts: [
      {
        chainId: chainId,
        abi: erc20ABI,
        address: address as `0x${string}`,
        functionName: 'symbol',
      },
      {
        chainId: chainId,
        abi: erc20ABI,
        address: address as `0x${string}`,
        functionName: 'decimals',
      },
    ],
  });

  const ticker = data?.[0]?.result as string;
  const decimals = data?.[1]?.result as bigint;

  return { ticker, decimals };
};
