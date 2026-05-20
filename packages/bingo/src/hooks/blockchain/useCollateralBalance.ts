import { useMemo } from 'react';
import { useReadContract, useBalance } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import {
  COLLATERAL_SYMBOLS,
  CHAIN_ID_ETHEREAL,
  DEFAULT_CHAIN_ID,
  CHAIN_ID_ETHEREAL_TESTNET,
} from '@sapience/sdk/constants';
import { collateralToken } from '@sapience/sdk/contracts';

/** Both native USDe and WUSDe are always 18 decimals */
const USDE_DECIMALS = 18;

interface UseCollateralBalanceProps {
  address?: `0x${string}`;
  chainId?: number;
  enabled?: boolean;
}

interface UseCollateralBalanceResult {
  rawBalance: bigint | undefined;
  /** Raw native USDe balance in wei (only on Ethereal) */
  rawNativeBalance: bigint;
  /** Raw wrapped USDe balance in wei (only on Ethereal) */
  rawWrappedBalance: bigint;
  balance: number;
  /** Native USDe balance (only on Ethereal) */
  nativeBalance: number;
  /** Wrapped USDe balance (only on Ethereal) */
  wrappedBalance: number;
  formattedBalance: string;
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
  const effectiveChainId = chainId ?? DEFAULT_CHAIN_ID;

  const isEtherealChain =
    effectiveChainId === CHAIN_ID_ETHEREAL ||
    effectiveChainId === CHAIN_ID_ETHEREAL_TESTNET;
  const collateralSymbol = COLLATERAL_SYMBOLS[effectiveChainId] || 'testUSDe';

  // --- Ethereal: native USDe balance ---
  const {
    data: nativeBalance,
    isLoading: isLoadingNative,
    refetch: refetchNative,
  } = useBalance({
    address,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address) && isEtherealChain,
      refetchInterval: 5000,
    },
  });

  // Collateral token address for the active chain (WUSDe on Ethereal, ERC-20 elsewhere)
  const collateralAssetAddress = collateralToken[effectiveChainId]?.address;

  // --- Ethereal: WUSDe (wrapped) balance ---
  const {
    data: wusdeBalance,
    isLoading: isLoadingWusde,
    refetch: refetchWusde,
  } = useReadContract({
    abi: erc20Abi,
    address: collateralAssetAddress,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: effectiveChainId,
    query: {
      enabled: enabled && Boolean(address) && isEtherealChain,
      refetchInterval: 5000,
    },
  });

  const {
    data: erc20Balance,
    isLoading: isLoadingErc20,
    refetch: refetchErc20,
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
    ? isLoadingNative || isLoadingWusde
    : isLoadingErc20;

  const refetch = () => {
    if (isEtherealChain) {
      refetchNative();
      refetchWusde();
    } else {
      refetchErc20();
    }
  };

  const result = useMemo(() => {
    if (isEtherealChain) {
      // Both native USDe and WUSDe are 18 decimals — add raw bigints, format once
      const rawNative = nativeBalance?.value ?? 0n;
      const rawWrapped = wusdeBalance ?? 0n;
      const rawTotal = rawNative + rawWrapped;

      const nativeNum = Number(formatUnits(rawNative, USDE_DECIMALS));
      const wrappedNum = Number(formatUnits(rawWrapped, USDE_DECIMALS));
      const totalNum = Number(formatUnits(rawTotal, USDE_DECIMALS));

      return {
        rawBalance: rawTotal,
        rawNativeBalance: rawNative,
        rawWrappedBalance: rawWrapped,
        balance: totalNum,
        nativeBalance: nativeNum,
        wrappedBalance: wrappedNum,
        decimals: USDE_DECIMALS,
      };
    }

    // Non-Ethereal: single ERC-20 read
    const raw = erc20Balance ?? 0n;
    const num = Number(formatUnits(raw, USDE_DECIMALS));

    return {
      rawBalance: erc20Balance ? raw : undefined,
      rawNativeBalance: 0n,
      rawWrappedBalance: 0n,
      balance: num,
      nativeBalance: 0,
      wrappedBalance: 0,
      decimals: USDE_DECIMALS,
    };
  }, [isEtherealChain, nativeBalance, wusdeBalance, erc20Balance]);

  return {
    rawBalance: result.rawBalance,
    rawNativeBalance: result.rawNativeBalance,
    rawWrappedBalance: result.rawWrappedBalance,
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
