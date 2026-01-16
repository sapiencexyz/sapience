'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';
import { useCollateralBalance } from '~/hooks/blockchain/useCollateralBalance';
import { useChainIdFromLocalStorage } from '~/hooks/blockchain/useChainIdFromLocalStorage';

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
  /** Suggested initial wager: min(balance, 10), formatted. Null if balance not ready */
  suggestedInitialWager: string | null;
  /** Whether balance has finished loading and is available */
  isBalanceReady: boolean;
}

const CollateralBalanceContext =
  createContext<CollateralBalanceContextValue | null>(null);

interface CollateralBalanceProviderProps {
  children: ReactNode;
}

export function CollateralBalanceProvider({
  children,
}: CollateralBalanceProviderProps): React.ReactElement {
  const { address: eoaAddress, isConnected } = useAccount();
  const { isSessionActive, smartAccountAddress } = useSession();
  const chainId = useChainIdFromLocalStorage();

  // Use smart account address when session is active, otherwise EOA
  // This ensures we show the balance of the address that will execute transactions
  const effectiveAddress =
    isSessionActive && smartAccountAddress ? smartAccountAddress : eoaAddress;

  const {
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
  } = useCollateralBalance({
    address: effectiveAddress,
    chainId,
    enabled: isConnected && !!effectiveAddress && !!chainId,
  });

  // Compute suggested initial wager: min(balance, 10), or null if not ready
  const suggestedInitialWager = useMemo(() => {
    if (isLoading || balance <= 0) return null;
    const initialWager = Math.min(balance, 10);
    return Number.isInteger(initialWager)
      ? initialWager.toString()
      : initialWager.toFixed(2);
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
    effectiveAddress,
    chainId,
    suggestedInitialWager,
    isBalanceReady,
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
