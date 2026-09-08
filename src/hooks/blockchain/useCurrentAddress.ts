import { useAccount } from 'wagmi';

/**
 * Returns the connected wallet address to use for contract interactions.
 *
 * Use this hook instead of useAccount().address for all user-specific
 * contract reads (balances, allowances, positions, etc.)
 */
export function useCurrentAddress() {
  const { address: walletAddress, isConnected } = useAccount();

  return {
    /** The current address to use for contract interactions */
    currentAddress: walletAddress,
    /** The connected wallet address */
    walletAddress,
    /** Whether the user is connected */
    isConnected,
  };
}
