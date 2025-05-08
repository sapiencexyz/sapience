import { useState } from 'react';
import type { Abi, Address } from 'viem';
import { useWriteContract } from 'wagmi';
import { useFoilAbi } from '../../../../ui/hooks/useFoilAbi';

export function useMarketGroupOwnership(marketGroupAddress: Address) {
  const [nominateLoading, setNominateLoading] = useState(false);
  const [nominateError, setNominateError] = useState<Error | null>(null);
  const [acceptLoading, setAcceptLoading] = useState(false);
  const [acceptError, setAcceptError] = useState<Error | null>(null);

  const { abi: marketGroupAbi } = useFoilAbi();

  const { writeContractAsync } = useWriteContract();

  const nominateNewOwner = async (newOwner: Address) => {
    setNominateLoading(true);
    setNominateError(null);
    try {
      // TODO: Replace 'nominateNewOwner' with actual function name
      await writeContractAsync({
        address: marketGroupAddress,
        abi: marketGroupAbi,
        functionName: 'transferOwnership',
        args: [newOwner],
      });
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
      // TODO: Replace 'acceptOwnership' with actual function name
      await writeContractAsync({
        address: marketGroupAddress,
        abi: marketGroupAbi,
        functionName: 'acceptOwnership',
        args: [],
      });
    } catch (err) {
      setAcceptError(err instanceof Error ? err : new Error('Unknown error'));
      throw err;
    } finally {
      setAcceptLoading(false);
    }
  };

  return {
    nominateNewOwner,
    nominateLoading,
    nominateError,
    acceptOwnership,
    acceptLoading,
    acceptError,
  };
}
