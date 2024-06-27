import { AddIcon } from '@chakra-ui/icons';
import { IconButton, useToast } from '@chakra-ui/react';
import * as React from 'react';
import { useWaitForTransactionReceipt, useWriteContract } from 'wagmi';

import Foil from '../../../../deployments/Foil.json';

export default function CreatePosition() {
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const toast = useToast();

  React.useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: 'There was an issue creating your position.',
        status: 'error',
        duration: 9000,
        isClosable: true,
      });
    } else if (hash) {
      toast({
        title: 'Submitted',
        description: 'Transaction submitted. Waiting for confirmation...',
        status: 'info',
        duration: 9000,
        isClosable: true,
      });
    }
  }, [toast, error, hash]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    writeContract({
      abi: Foil.abi,
      address: Foil.address as `0x${string}`,
      functionName: 'createAccount',
      args: [],
    });
  }

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash });

  React.useEffect(() => {
    if (isConfirmed) {
      toast({
        title: 'Success',
        description: "We've created your position for you.",
        status: 'success',
        duration: 9000,
        isClosable: true,
      });
    }
  }, [toast, isConfirmed]);

  return (
    <IconButton
      aria-label="Create position"
      rounded="md"
      type="submit"
      colorScheme="gray"
      bg="#0053ff"
      isLoading={isPending || isConfirming}
      icon={<AddIcon color="white" />}
      onClick={() => submit}
    />
  );
}
