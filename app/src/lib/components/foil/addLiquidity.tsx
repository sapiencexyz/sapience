'use client';

import {
  Flex,
  Box,
  Heading,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  InputGroup,
  InputRightAddon,
  Button,
} from '@chakra-ui/react';
import { useState } from 'react';
import { parseEther } from 'viem';
import {
  type BaseError,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';

const AddLiquidity = () => {
  const [depositAmount, setDepositAmount] = useState(0);
  const [lowPrice, setLowPrice] = useState(0);
  const [highPrice, setHighPrice] = useState(0);

  const { data: hash, error, isPending, writeContract } = useWriteContract();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    writeContract({
      address: '0xFBA3912Ca04dd458c843e2EE08967fC04f3579c2',
      abi: [],
      functionName: 'addLiqudiity',
      args: [
        BigInt(depositAmount),
        BigInt(parseEther(lowPrice.toString())),
        BigInt(parseEther(highPrice.toString())),
      ],
    });
  }

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  return (
    <Box>
      <Heading size="md" mb={3}>
        Add Liquidity
      </Heading>
      <form onSubmit={submit}>
        <Flex gap={4} mb={6}>
          <FormControl>
            <FormLabel>Deposit Amount</FormLabel>
            <InputGroup>
              <Input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
              />
              <InputRightAddon>cbETH</InputRightAddon>
            </InputGroup>
            <FormHelperText>Something here</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>Low Price</FormLabel>
            <InputGroup>
              <Input
                type="number"
                value={lowPrice}
                onChange={(e) => setLowPrice(Number(e.target.value))}
              />
              <InputRightAddon>Gigagas</InputRightAddon>
            </InputGroup>
            <FormHelperText>Something here</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>High Price</FormLabel>
            <InputGroup>
              <Input
                type="number" // Ensures only numeric input
                value={highPrice}
                onChange={(e) => setHighPrice(Number(e.target.value))}
              />
              <InputRightAddon>Gigagas</InputRightAddon>
            </InputGroup>
            <FormHelperText>Something here</FormHelperText>
          </FormControl>
        </Flex>
        <Button disabled={isPending} width="full" colorScheme="green">
          {isPending ? 'Confirming...' : 'Add Liquidity'}
        </Button>{' '}
        {hash && <div>Transaction Hash: {hash}</div>}
        {isConfirming && <div>Waiting for confirmation...</div>}
        {isConfirmed && <div>Transaction confirmed.</div>}
        {error && (
          <div>Error: {(error as BaseError).shortMessage || error.message}</div>
        )}
      </form>
    </Box>
  );
};

export default AddLiquidity;
