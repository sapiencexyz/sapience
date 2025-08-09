import { useCallback } from 'react';
import { useAccount, useSwitchChain } from 'wagmi';

interface ChainValidationOptions {
  onError?: (error: string) => void;
  onLoading?: (loading: boolean) => void;
}

interface ChainValidationError extends Error {
  code?:
    | 'WALLET_NOT_CONNECTED'
    | 'CHAIN_UNDEFINED'
    | 'SWITCH_UNAVAILABLE'
    | 'SWITCH_FAILED';
}

/**
 * Hook that provides a function to validate and switch to the target chain
 * @param options Configuration options for chain validation
 * @returns Object with validateAndSwitchChain function
 */
export function useChainValidation({
  onError,
  onLoading,
}: ChainValidationOptions) {
  const { address, chainId: currentChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  /**
   * Validates wallet connection and switches to target chain if needed
   * @returns Promise that resolves when chain validation is complete
   * @throws ChainValidationError with specific error codes
   */
  const validateAndSwitchChain = useCallback(
    async (chainId: number): Promise<void> => {
      try {
        // Check wallet connection
        if (!address) {
          const error = new Error(
            'Wallet not connected. Please connect your wallet.'
          ) as ChainValidationError;
          error.code = 'WALLET_NOT_CONNECTED';
          throw error;
        }

        // Check if current chain is determined
        if (currentChainId === undefined) {
          const error = new Error(
            'Could not determine the current network. Please ensure your wallet is connected properly and the network is recognized.'
          ) as ChainValidationError;
          error.code = 'CHAIN_UNDEFINED';
          throw error;
        }

        // Switch chain if needed
        if (currentChainId !== chainId) {
          if (!switchChainAsync) {
            const error = new Error(
              'Chain switching functionality is not available. Please switch manually in your wallet.'
            ) as ChainValidationError;
            error.code = 'SWITCH_UNAVAILABLE';
            throw error;
          }

          try {
            onLoading?.(true);
            await switchChainAsync({ chainId: chainId });
          } catch (switchError) {
            onLoading?.(false);
            console.error('Failed to switch chain:', switchError);

            const message =
              switchError instanceof Error &&
              switchError.message.includes('User rejected the request')
                ? 'Network switch rejected by user.'
                : 'Failed to switch network. Please try again.';

            const error = new Error(message) as ChainValidationError;
            error.code = 'SWITCH_FAILED';

            throw error;
          } finally {
            onLoading?.(false);
          }
        }

        // Chain validation successful
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Chain validation failed';
        onError?.(errorMessage);
        throw error;
      }
    },
    [address, currentChainId, switchChainAsync, onError, onLoading]
  );

  return {
    validateAndSwitchChain,
  };
}
