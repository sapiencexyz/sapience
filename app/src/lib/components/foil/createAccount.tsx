import { InputGroup, Input, Button, InputRightElement, FormControl, FormHelperText } from '@chakra-ui/react';
import type * as React from 'react';
import {
  type BaseError,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import Foil from '../../../../deployments/Foil.json';
import { useState } from 'react';

export default function createAccount() {
  const { data: hash, error, isPending, writeContract } = useWriteContract();
  const [id, setId] = useState(0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    writeContract({
      ...Foil,
      functionName: 'mint',
      args: [BigInt(id)],
    });
  }

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  return (
    <form onSubmit={submit}>
      <FormControl>
      <InputGroup size="md">
        <Input pr="8rem" type="number" placeholder="Account ID" required onChange={(event) => setId(event.target.value)} />
        <InputRightElement width="8.5rem">
          <Button rounded="md" h="1.75rem" size="sm" type="submit" colorScheme="blue">
          {isPending ? 'Confirming...' : 'Create Account'}
          </Button>
        </InputRightElement>
      </InputGroup>

      {hash && <FormHelperText>Transaction Hash: {hash}</FormHelperText>}
      {isConfirming && <FormHelperText>Waiting for confirmation...</FormHelperText>}
      {isConfirmed && <FormHelperText>Transaction confirmed.</FormHelperText>}
      {error && (
        <FormHelperText>Error: {(error as BaseError).shortMessage || error.message}</FormHelperText>
      )}
      </FormControl>
    </form>
  );
}
