import { useReadContract } from 'wagmi';
import erc20ABI from '../abis/erc20abi.json';

export const useCollateralInfo = (chainId?: number, address?: `0x${string}`) => {
  
  const tickerFunctionResult = useReadContract({
    chainId: chainId,
    abi: erc20ABI,
    address: address as `0x${string}`,
    functionName: 'symbol',
  });
  const ticker = tickerFunctionResult.data as string;

  const decimalsFunctionResult = useReadContract({
    chainId: chainId,
    abi: erc20ABI,
    address: address as `0x${string}`,
    functionName: 'decimals',
  });
  const decimals = decimalsFunctionResult.data as bigint;

  return { ticker, decimals };
};
