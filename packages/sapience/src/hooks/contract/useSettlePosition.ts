import { sapienceAbi } from '@sapience/ui/lib/abi';
import type { Abi } from 'abitype';
import { useCallback, useState } from 'react';
import { useSimulateContract } from 'wagmi';

import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

interface UseSettlePositionProps {
  marketAddress: string;
  chainId: number;
  positionId: string;
  enabled: boolean;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onTxHash?: (txHash: string) => void;
}

export function useSettlePosition({
  marketAddress,
  chainId,
  positionId,
  enabled,
  onSuccess,
  onError,
  onTxHash,
}: UseSettlePositionProps) {
  const [error, setError] = useState<Error | null>(null);

  const { writeContract, isPending } = useSapienceWriteContract({
    onSuccess: () => {
      setError(null); // Clear any previous errors on success
      onSuccess?.();
    },
    onError: (error) => {
      setError(error); // Store error for component access
      onError?.(error); // Call the component's error handler
    },
    onTxHash,
    successMessage: 'Position settled successfully',
    fallbackErrorMessage: 'Failed to settle position',
  });

  // Use wagmi's simulation hook with enabled: false so it only runs when we explicitly want it to
  const {
    data: simulationData,
    error: simulationError,
    isLoading: loadingSimulation,
    refetch: simulateSettlement,
  } = useSimulateContract({
    address: marketAddress as `0x${string}`,
    abi: sapienceAbi().abi as Abi,
    functionName: 'settlePosition',
    args: positionId ? [BigInt(positionId)] : undefined,
    chainId,
    query: {
      enabled,
    },
  });

  // Function to settle a position
  const settlePosition = useCallback(async (): Promise<void> => {
    try {
      setError(null); // Clear any previous errors
      // Call settle position function using sapience write contract
      await writeContract({
        address: marketAddress as `0x${string}`,
        abi: sapienceAbi().abi as Abi,
        functionName: 'settlePosition',
        args: [BigInt(positionId)],
        chainId,
      });
    } catch (err) {
      console.error('Error settling position:', err);
      // Don't set error here as useSapienceWriteContract will handle it
    }
  }, [marketAddress, chainId, writeContract, positionId]);

  return {
    settlePosition,
    loadingSimulation,
    simulateSettlement,
    simulationData,
    isSettling: isPending,
    error: error || simulationError,
  };
}
