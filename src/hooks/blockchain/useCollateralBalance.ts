import { useMemo } from 'react';
import { useReadContract } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { COLLATERAL_SYMBOLS, DEFAULT_CHAIN_ID } from '~/lib/sdk/constants';
import { collateralToken } from '~/lib/sdk/contracts';

/** USDe is always 18 decimals */
const USDE_DECIMALS = 18;

interface UseCollateralBalanceProps {
  address?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}

interface UseCollateralBalanceResult {
  rawBalance: bigint | undefined;
  balance: number;
  formattedBalance: string;
  decimals: number;
  symbol: string;
  isLoading: boolean;
  refetch: () => void;
}

export function useCollateralBalance({
  address,
  chainId,
  enabled = true,
}: UseCollateralBalanceProps): UseCollateralBalanceResult {
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;
  const collateralSymbol = COLLATERAL_SYMBOLS[effectiveChainId] || 'testUSDe';

  const collateralAssetAddress = collateralToken[effectiveChainId]?.address;

  const {
    data: erc20Balance,
    isLoading,
    refetch,
  } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address),
      refetchInterval: 5000,
    },
  });

  const result = useMemo(() => {
    const raw = erc20Balance ?? 0n;
    return {
      rawBalance: erc20Balance ? raw : undefined,
      balance: Number(formatUnits(raw, USDE_DECIMALS)),
    };
  }, [erc20Balance]);

  return {
    rawBalance: result.rawBalance,
    balance: result.balance,
    formattedBalance: `${result.balance} ${collateralSymbol}`,
    decimals: USDE_DECIMALS,
    symbol: collateralSymbol,
    isLoading,
    refetch: () => {
      void refetch();
    },
  };
}
