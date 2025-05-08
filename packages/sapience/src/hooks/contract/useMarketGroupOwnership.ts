import { useFoilAbi } from '@foil/ui/hooks/useFoilAbi';
import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { useReadContract, useWriteContract } from 'wagmi';

export function useMarketGroupOwnership(marketGroupAddress: Address) {
  const [nominateLoading, setNominateLoading] = useState(false);
  const [nominateError, setNominateError] = useState<Error | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<Error | null>(null);

  const { abi: marketGroupAbi } = useFoilAbi();

  const {
    data: pendingOwner,
    isLoading: pendingOwnerLoading,
    error: pendingOwnerError,
    refetch: refetchPendingOwner,
  } = useReadContract({
    address: marketGroupAddress,
    abi: marketGroupAbi,
    functionName: 'pendingOwner',
  });

  const { writeContractAsync } = useWriteContract();

  const nominateNewOwner = async (newOwner: Address) => {
    setNominateLoading(true);
    setNominateError(null);
    try {
      await writeContractAsync({
        address: marketGroupAddress,
        abi: marketGroupAbi,
        functionName: 'transferOwnership',
        args: [newOwner],
      });
      await refetchPendingOwner();
    } catch (err) {
      setNominateError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    } finally {
      setNominateLoading(false);
    }
  };

  const acceptOwnership = async () => {
    setAcceptLoading(true);
    setAcceptError(null);
    try {
      await writeContractAsync({
        address: marketGroupAddress,
        abi: marketGroupAbi,
        functionName: 'acceptOwnership',
        args: [],
      });
      await refetchPendingOwner();
    } catch (err) {
      setAcceptError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    } finally {
      setAcceptLoading(false);
    }
  };

  useEffect(() => {
    refetchPendingOwner();
  }, [marketGroupAddress, refetchPendingOwner]);

  return {
    nominateNewOwner,
    nominateLoading,
    nominateError,
    acceptOwnership,
    acceptLoading,
    acceptError,
    pendingOwner: pendingOwner as Address | undefined,
    pendingOwnerLoading,
    pendingOwnerError,
    refetchPendingOwner,
  };
}
