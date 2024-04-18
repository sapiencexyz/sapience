'use client';

import {
  Box,
  FormControl,
  Text,
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

const AddLiquidity = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  params,
}: {
  params: { mode: string; selectedData: JSON };
}) => {
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

  // get tickSpacing from context
  function priceToTick(price: number, tickSpacing: number): number {
    const tick: number = Math.log(price) / Math.log(1.0001);
    // Round to the nearest valid tick that is a multiple of tickSpacing
    const roundedTick: number = Math.round(tick / tickSpacing) * tickSpacing;
    return roundedTick;
}

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash,
    });

  return (
    <Box>
      <form onSubmit={submit}>
        <FormControl mb={4}>
          <FormLabel>Collateral Amount</FormLabel>
          <InputGroup>
            <Input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(Number(e.target.value))}
            />
            <InputRightAddon>cbETH</InputRightAddon>
          </InputGroup>
        </FormControl>
        <FormControl mb={4}>
          <FormLabel>Low Price</FormLabel>
          <InputGroup>
            <Input
              type="number"
              value={lowPrice}
              onChange={(e) => setLowPrice(Number(e.target.value))}
            />
            <InputRightAddon>cbETH/Ggas</InputRightAddon>
          </InputGroup>
        </FormControl>
        <FormControl mb={4}>
          <FormLabel>High Price</FormLabel>
          <InputGroup>
            <Input
              type="number" // Ensures only numeric input
              value={highPrice}
              onChange={(e) => setHighPrice(Number(e.target.value))}
            />
            <InputRightAddon>cbETH/Ggas</InputRightAddon>
          </InputGroup>
        </FormControl>
        <Box mb="4">
          <Text fontSize="sm" color="gray.500" mb="1">
            Net Position: X Ggas to X Ggas
          </Text>
          <Text fontSize="sm" color="gray.500" mb="1">
            Wallet Balance: X cbETH to x cbETH
          </Text>
        </Box>
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
