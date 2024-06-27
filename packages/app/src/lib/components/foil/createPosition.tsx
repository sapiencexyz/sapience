import { AddIcon } from '@chakra-ui/icons';
import {
  IconButton,
  FormControl,
  FormHelperText,
} from '@chakra-ui/react';
import type * as React from 'react';
import {
  type BaseError,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import Foil from '../../../../deployments/Foil.json';

export default function createAccount() {
  const { data: hash, error, isPending, writeContract } = useWriteContract();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    console.log({
      ...Foil,
      functionName: 'createAccount',
    });
    e.preventDefault();
    writeContract({
      ...Foil,
      functionName: 'createAccount',
    });
  }

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  return (
    <>
      <IconButton
        rounded="md"
        type="submit"
        colorScheme="gray"
        bg="#0053ff"
        isLoading={isPending}
        icon={<AddIcon color="white" />}
        onClick={submit}
      />

      <FormControl>
        {hash && <FormHelperText>Transaction Hash: {hash}</FormHelperText>}
        {isConfirming && (
          <FormHelperText>Waiting for confirmation...</FormHelperText>
        )}
        {isConfirmed && <FormHelperText>Transaction confirmed.</FormHelperText>}
        {error && (
          <FormHelperText>
            Error: {(error as BaseError).shortMessage || error.message}
          </FormHelperText>
        )}
      </FormControl>
    </>
  );
}
