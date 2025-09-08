import { useSapienceAbi } from '@sapience/ui/hooks/useSapienceAbi';
import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { useReadContract } from 'wagmi';

import { useSapienceWriteContract } from '~/hooks/blockchain/useSapienceWriteContract';

export function useMarketGroupOwnership(marketGroupAddress: Address) {
  const { abi: marketGroupAbi } = useSapienceAbi();
  const [nominateError, setNominateError] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

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

  const { writeContract: nominateWriteContract, isPending: nominateLoading } =
    useSapienceWriteContract({
      onSuccess: () => {
        refetchPendingOwner();
        setNominateError(null);
      },
      onError: (error) => {
        setNominateError(error.message);
      },
      successMessage: 'Ownership nomination submission was successful',
      fallbackErrorMessage: 'Failed to nominate new owner',
    });

  const { writeContract: acceptWriteContract, isPending: acceptLoading } =
    useSapienceWriteContract({
      onSuccess: () => {
        refetchPendingOwner();
        setAcceptError(null);
      },
      onError: (error) => {
        setAcceptError(error.message);
      },
      successMessage: 'Ownership acceptance submission was successful',
      fallbackErrorMessage: 'Failed to accept ownership',
    });

  const nominateNewOwner = async (newOwner: Address, chainId: number) => {
    setNominateError(null);
    try {
      await nominateWriteContract({
        chainId,
        address: marketGroupAddress,
        abi: marketGroupAbi,
        functionName: 'transferOwnership',
        args: [newOwner],
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to nominate owner';
      setNominateError(errorMessage);
      throw err;
    }
  };

  const acceptOwnership = async (chainId: number) => {
    setAcceptError(null);
    try {
      await acceptWriteContract({
        chainId,
        address: marketGroupAddress,
        abi: marketGroupAbi,
        functionName: 'acceptOwnership',
        args: [],
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to accept ownership';
      setAcceptError(errorMessage);
      throw err;
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
