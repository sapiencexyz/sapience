'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';

interface CollateralBalanceContextValue {
  /** User's collateral balance in human-readable units */
  balance: number;
  /** Raw balance in wei */
  rawBalance: bigint | undefined;
  /** Formatted balance string (e.g., "0.55 USDe") */
  formattedBalance: string;
  /** Token decimals */
  decimals: number;
  /** Token symbol */
  symbol: string;
  /** Whether balance is loading */
  isLoading: boolean;
  /** Whether on Ethereal chain */
  isEtherealChain: boolean;
  /** Native USDe balance (only on Ethereal) */
  nativeBalance: number;
  /** Wrapped USDe balance (only on Ethereal) */
  wrappedBalance: number;
  /** Refetch balance */
  refetch: () => void;
  /** The address whose balance is being shown */
  effectiveAddress: `0x${string}` | undefined;
  /** Current chain ID */
  chainId: number;
  /** Suggested initial position size: min(balance, 10), formatted. Null if balance not ready */
  suggestedInitialPositionSize: string | null;
  /** Whether balance has finished loading and is available */
  isBalanceReady: boolean;
  /** Whether we're using the user's wallet (EOA) vs smart account */
  isUsingEoa: boolean;
}

const CollateralBalanceContext =
  createContext<CollateralBalanceContextValue | null>(null);

interface CollateralBalanceProviderProps {
  children: ReactNode;
}

export function CollateralBalanceProvider({
  children,
}: CollateralBalanceProviderProps): React.ReactElement {
  const { isConnected } = useAccount();
  const { effectiveAddress, isUsingSmartAccount, isCalculatingAddress } =
    useSession();
  const chainId = DEFAULT_CHAIN_ID;

  const {
    balance,
    rawBalance,
    formattedBalance,
    decimals,
    symbol,
    isLoading: isBalanceLoading,
    isEtherealChain,
    nativeBalance,
    wrappedBalance,
    refetch,
  } = useCollateralBalance({
    address: effectiveAddress ?? undefined,
    chainId,
    enabled: isConnected && !!effectiveAddress && !!chainId,
  });

  // Include address calculation in loading state to prevent flicker
  // when switching to smart account mode before address is computed
  const isLoading = isBalanceLoading || isCalculatingAddress;

  // Derive from SessionContext's canonical state
  const isUsingEoa = !isUsingSmartAccount;

  // Compute suggested initial position size: min(balance, 10), or null if not ready
  const suggestedInitialPositionSize = useMemo(() => {
    if (isLoading || balance <= 0) return null;
    const initialPositionSize = Math.min(balance, 10);
    return Number.isInteger(initialPositionSize)
      ? initialPositionSize.toString()
      : initialPositionSize.toFixed(2);
  }, [isLoading, balance]);

  const isBalanceReady = !isLoading && balance > 0;

  const value: CollateralBalanceContextValue = {
    balance,
    rawBalance,
    formattedBalance,
    decimals,
    symbol,
    isLoading,
    isEtherealChain,
    nativeBalance,
    wrappedBalance,
    refetch,
    effectiveAddress: effectiveAddress ?? undefined,
    chainId,
    suggestedInitialPositionSize,
    isBalanceReady,
    isUsingEoa,
  };

  return (
    <CollateralBalanceContext.Provider value={value}>
      {children}
    </CollateralBalanceContext.Provider>
  );
}

export function useCollateralBalanceContext(): CollateralBalanceContextValue {
  const context = useContext(CollateralBalanceContext);
  if (!context) {
    throw new Error(
      'useCollateralBalanceContext must be used within a CollateralBalanceProvider'
    );
  }
  return context;
}

/**
 * Safe version that returns null if not within provider.
 * Useful for components that may or may not be within the provider.
 */
export function useCollateralBalanceContextSafe(): CollateralBalanceContextValue | null {
  return useContext(CollateralBalanceContext);
}
