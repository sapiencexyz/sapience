import { useAccount } from 'wagmi';
import { useSession } from '~/lib/context/SessionContext';

/**
 * Returns the current address to use for contract interactions.
 *
 * - In smart account mode: returns the smart account address
 * - In EOA mode: returns the wallet address
 *
 * Use this hook instead of useAccount().address for all user-specific
 * contract reads (balances, allowances, positions, etc.)
 */
export function useCurrentAddress() {
  const { address: walletAddress, isConnected } = useAccount();
  const { effectiveAddress, isCalculatingAddress, isUsingSmartAccount } =
    useSession();

  return {
    /** The current address to use for contract interactions */
    currentAddress: effectiveAddress ?? walletAddress,
    /** The raw wallet address (EOA) */
    walletAddress,
    /** Whether we're still calculating the smart account address */
    isCalculating: isCalculatingAddress,
    /** Whether the user is connected */
    isConnected,
    /** Whether using smart account mode */
    isUsingSmartAccount,
  };
}
