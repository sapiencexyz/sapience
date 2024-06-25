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
import { useEffect, useState } from 'react';
import { encodeAbiParameters, numberToHex, parseEther, toHex } from 'viem';
import {
  type BaseError,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  prepareTransactionRequest,
} from 'wagmi';

import CollateralAsset from '../../../../deployments/CollateralAsset/MintableToken.json';
import Foil from '../../../../deployments/Foil.json';

const tickSpacing = 200; // Hardcoded for now, should be retrieved with pool.tickSpacing()
function priceToTick(price: number, tickSpacing: number): number {
  const tick: number = Math.log(price) / Math.log(1.0001);
  // Round to the nearest valid tick that is a multiple of tickSpacing
  const roundedTick: number = Math.round(tick / tickSpacing) * tickSpacing;
  return roundedTick;
}

const AddLiquidity = ({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  params,
}: {
  params: { mode: string; selectedData: JSON };
}) => {
  const account = useAccount();
  const [depositAmount, setDepositAmount] = useState(0);
  const [lowPrice, setLowPrice] = useState(20);
  const [highPrice, setHighPrice] = useState(200);
  const [baseToken, setBaseToken] = useState(0);
  const [quoteToken, setQuoteToken] = useState(0);

  const collateralAmountFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: CollateralAsset.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [account.address],
  });
  const [transactionStep, setTransactionStep] = useState(0); // 0: none, 1: approve sent, 2: approve confirmed, 3: addLiquidity sent

  const { data: approveHash, writeContract: approveWrite } = useWriteContract();
  const { data: addLiquidityHash, writeContract: addLiquidityWrite } =
    useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });
  const { isSuccess: addLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: addLiquidityHash,
  });

  const handleFormSubmit = (e) => {
    e.preventDefault();

    approveWrite({
      abi: CollateralAsset.abi,
      address: CollateralAsset.address,
      functionName: 'approve',
      args: [CollateralAsset.address, BigInt(depositAmount)],
    }); // Start the transaction sequence
    setTransactionStep(1);
  };

  useEffect(() => {
    console.log(
      'Approve Success:',
      approveSuccess,
      'Transaction Step:',
      transactionStep
    );
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2); // Move to the next step once approve is confirmed
    }
  }, [approveSuccess, transactionStep]);

  useEffect(() => {
    console.log('almost there', transactionStep);
    if (transactionStep === 2) {
      console.log('heyyyyy');
      addLiquidityWrite({
        address: Foil.address,
        abi: Foil.abi,
        functionName: 'addLiquidity',
        args: [
          {
            accountId: BigInt(420), // TODO, dont hardcode
            amountTokenA: BigInt(1), // TODO, dont hardcode
            amountTokenB: BigInt(1), // TODO, dont hardcode
            collateralAmount: BigInt(depositAmount),
            lowerTick: BigInt(priceToTick(lowPrice, tickSpacing)),
            upperTick: BigInt(priceToTick(highPrice, tickSpacing)),
          },
        ],
      });
    }
  }, [transactionStep, addLiquidityWrite]);

  return (
    <Box>
      <form onSubmit={handleFormSubmit}>
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
              type="number"
              value={highPrice}
              onChange={(e) => setHighPrice(Number(e.target.value))}
            />
            <InputRightAddon>cbETH/Ggas</InputRightAddon>
          </InputGroup>
        </FormControl>
        <FormControl mb={4}>
          <FormLabel>vGwei</FormLabel>
          <InputGroup>
            <Input
              type="number"
              value={baseToken}
              onChange={(e) => setBaseToken(Number(e.target.value))}
            />
            <InputRightAddon>vGwei</InputRightAddon>
          </InputGroup>
        </FormControl>
        <FormControl mb={4}>
          <FormLabel>vGas</FormLabel>
          <InputGroup>
            <Input
              type="number"
              value={quoteToken}
              onChange={(e) => setQuoteToken(Number(e.target.value))}
            />
            <InputRightAddon>vGas</InputRightAddon>
          </InputGroup>
        </FormControl>
        <Box mb="4">
          <Text fontSize="sm" color="gray.500" mb="1">
            Net Position: X Ggas to X Ggas
          </Text>
          <Text fontSize="sm" color="gray.500" mb="1">
            Wallet Balance: {collateralAmountFunctionResult?.data?.toString()}{' '}
            cbETH to x cbETH
          </Text>
        </Box>
        <Button width="full" variant="brand" onClick={handleFormSubmit}>
          Add Liquidity
        </Button>
      </form>
    </Box>
  );
};

export default AddLiquidity;
