import { useMemo } from 'react';
import { useReadContract, useBalance } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import {
  COLLATERAL_SYMBOLS,
  CHAIN_ID_ETHEREAL,
  CHAIN_ID_ETHEREAL_TESTNET,
  DEFAULT_CHAIN_ID,
  ETHEREAL_WUSDE_ADDRESS,
} from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';

interface UseCollateralBalanceProps {
  address?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}

interface UseCollateralBalanceResult {
  rawBalance: bigint | undefined;

  balance: number;

  /** Native USDe balance (only on Ethereal) */
  nativeBalance: number;

  /** Wrapped USDe balance (only on Ethereal) */
  wrappedBalance: number;

  formattedBalance: string;
  /** Token decimals */
  decimals: number;

  symbol: string;

  isEtherealChain: boolean;

  isLoading: boolean;

  refetch: () => void;
}

export function useCollateralBalance({
  address,
  chainId,
  enabled = true,
}: UseCollateralBalanceProps): UseCollateralBalanceResult {
  // If callers omit chainId, follow the SDK default chain.
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;

  const isEtherealChain =
    effectiveChainId === CHAIN_ID_ETHEREAL ||
    effectiveChainId === CHAIN_ID_ETHEREAL_TESTNET;
  const collateralSymbol = COLLATERAL_SYMBOLS[effectiveChainId] || 'testUSDe';

  const {
    data: nativeBalance,
    isLoading: isLoadingNativeBalance,
    refetch: refetchNative,
  } = useBalance({
    address,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address) && isEtherealChain,
      refetchInterval: 5000,
    },
  });

  const { data: wusdeDecimals, isLoading: isLoadingWusdeDecimals } =
    useReadContract({
      abi: erc20Abi,
      address: ETHEREAL_WUSDE_ADDRESS,
      functionName: 'decimals',
      chainId: effectiveChainId,
      query: {
        enabled: enabled && Boolean(address) && isEtherealChain,
        refetchInterval: 5000,
      },
    });

  const {
    data: wusdeBalance,
    isLoading: isLoadingWusdeBalance,
    refetch: refetchWusde,
  } = useReadContract({
    abi: erc20Abi,
    address: ETHEREAL_WUSDE_ADDRESS,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address) && isEtherealChain,
      refetchInterval: 5000,
    },
  });

  const collateralAssetAddress = collateralToken[effectiveChainId]?.address;

  const { data: usdeDecimals, isLoading: isLoadingUsdeDecimals } =
    useReadContract({
      abi: erc20Abi,
      address: collateralAssetAddress,
      functionName: 'decimals',
      chainId: effectiveChainId,
      query: {
        enabled: enabled && Boolean(address) && !isEtherealChain,
        refetchInterval: 5000,
      },
    });

  const {
    data: usdeBalance,
    isLoading: isLoadingUsdeBalance,
    refetch: refetchUsde,
  } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address) && !isEtherealChain,
      refetchInterval: 5000,
    },
  });

  const isLoading = isEtherealChain
    ? isLoadingNativeBalance || isLoadingWusdeDecimals || isLoadingWusdeBalance
    : isLoadingUsdeDecimals || isLoadingUsdeBalance;

  const refetch = () => {
    if (isEtherealChain) {
      refetchNative();
      refetchWusde();
    } else {
      refetchUsde();
    }
  };

  const result = useMemo(() => {
    try {
      if (isEtherealChain) {
        let totalBalance = 0;
        let rawNative = 0n;
        let rawWrapped = 0n;
        let nativeNum = 0;
        let wrappedNum = 0;

        if (nativeBalance) {
          nativeNum = Number(nativeBalance.formatted);
          if (!Number.isNaN(nativeNum)) {
            totalBalance += nativeNum;
            rawNative = nativeBalance.value;
          }
        }

        if (wusdeBalance) {
          const dec =
            typeof wusdeDecimals === 'number'
              ? wusdeDecimals
              : Number(wusdeDecimals ?? 18);
          const wusdeFormatted = formatUnits(wusdeBalance, dec);
          wrappedNum = Number(wusdeFormatted);
          if (!Number.isNaN(wrappedNum)) {
            totalBalance += wrappedNum;
            rawWrapped = wusdeBalance;
          }
        }

        return {
          rawBalance: rawNative + rawWrapped,
          balance: totalBalance,
          nativeBalance: nativeNum,
          wrappedBalance: wrappedNum,
          decimals: nativeBalance?.decimals || 18,
        };
      } else {
        const dec =
          typeof usdeDecimals === 'number'
            ? usdeDecimals
            : Number(usdeDecimals ?? 18);
        if (!usdeBalance) {
          return {
            rawBalance: undefined,
            balance: 0,
            nativeBalance: 0,
            wrappedBalance: 0,
            decimals: dec,
          };
        }
        const human = formatUnits(usdeBalance, dec);
        const num = Number(human);
        return {
          rawBalance: usdeBalance,
          balance: Number.isNaN(num) ? 0 : num,
          nativeBalance: 0,
          wrappedBalance: 0,
          decimals: dec,
        };
      }
    } catch {
      return {
        rawBalance: undefined,
        balance: 0,
        nativeBalance: 0,
        wrappedBalance: 0,
        decimals: 18,
      };
    }
  }, [
    isEtherealChain,
    nativeBalance,
    wusdeBalance,
    wusdeDecimals,
    usdeBalance,
    usdeDecimals,
  ]);

  return {
    rawBalance: result.rawBalance,
    balance: result.balance,
    nativeBalance: result.nativeBalance,
    wrappedBalance: result.wrappedBalance,
    formattedBalance: `${result.balance} ${collateralSymbol}`,
    decimals: result.decimals,
    symbol: collateralSymbol,
    isEtherealChain,
    isLoading,
    refetch,
  };
}
