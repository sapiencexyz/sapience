import erc20ABI from '@foil/ui/abis/erc20abi.json';
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

interface UseTokenBalanceProps {
  tokenAddress?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
  decimals?: number;
}

/**
 * Hook to fetch and format a token balance for the connected wallet
 */
export function useTokenBalance({
  tokenAddress,
  chainId,
  enabled = true,
  decimals = 18,
}: UseTokenBalanceProps) {
  const { address, isConnected } = useAccount();
  const [formattedBalance, setFormattedBalance] = useState('0');

  // Fetch token balance from connected wallet
  const {
    data: tokenBalanceData,
    isLoading,
    error,
    refetch,
  } = useReadContract({
    abi: erc20ABI,
    address: tokenAddress,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId,
    query: {
      enabled:
        enabled && isConnected && !!address && !!tokenAddress && !!chainId,
    },
  });

  // Format token balance and update state when data changes
  useEffect(() => {
    try {
      if (tokenBalanceData) {
        const formatted = formatUnits(
          BigInt(tokenBalanceData.toString()),
          decimals
        );
        setFormattedBalance(formatted);
      }
    } catch (err) {
      console.error('Error formatting token balance:', err);
    }
  }, [tokenBalanceData, decimals]);

  return {
    balance: formattedBalance,
    rawBalance: tokenBalanceData,
    isLoading,
    error,
    refetch,
  };
}
