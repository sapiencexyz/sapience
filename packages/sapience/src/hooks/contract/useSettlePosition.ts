import { foilAbi } from '@foil/ui/lib/abi';
import type { Abi } from 'abitype';
import { useCallback, useState } from 'react';
import { useSimulateContract, useWriteContract } from 'wagmi';

interface UseSettlePositionProps {
  marketAddress: string;
  chainId: number;
  positionId: string;
  enabled: boolean;
}

export function useSettlePosition({
  marketAddress,
  chainId,
  positionId,
  enabled,
}: UseSettlePositionProps) {
  const [isSettling, setIsSettling] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  // Use wagmi's simulation hook with enabled: false so it only runs when we explicitly want it to
  const {
    data: simulationData,
    error: simulationError,
    isLoading: loadingSimulation,
    refetch: simulateSettlement,
  } = useSimulateContract({
    address: marketAddress as `0x${string}`,
    abi: foilAbi().abi as Abi,
    functionName: 'settlePosition',
    args: positionId ? [BigInt(positionId)] : undefined,
    chainId,
    query: {
      enabled,
    },
  });

  // Function to settle a position
  const settlePosition = useCallback(
    async (positionId: string): Promise<string | undefined> => {
      setIsSettling(true);
      setError(null);
      setTxHash(null);

      try {
        // Call settle position function
        const hash = await writeContractAsync({
          address: marketAddress as `0x${string}`,
          abi: foilAbi().abi as Abi,
          functionName: 'settlePosition',
          args: [BigInt(positionId)],
          chainId,
        });

        setTxHash(hash);
        return hash;
      } catch (err) {
        console.error('Error settling position:', err);
        setError(
          err instanceof Error ? err : new Error('Failed to settle position')
        );
        return undefined;
      } finally {
        setIsSettling(false);
      }
    },
    [marketAddress, chainId, writeContractAsync]
  );

  return {
    settlePosition,
    loadingSimulation,
    simulateSettlement,
    simulationData,
    isSettling,
    error,
    txHash,
    simulationError,
  };
}
