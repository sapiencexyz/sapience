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
  useToast,
} from '@chakra-ui/react';
import { Position } from '@uniswap/v3-sdk';
import { useContext, useEffect, useState } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi';

import CollateralAsset from '../../../../deployments/CollateralAsset/MintableToken.json';
import Foil from '../../../../deployments/Foil.json';

import { MarketContext } from '~/lib/context/MarketProvider';

const tickSpacing = 200; // Hardcoded for now, should be retrieved with pool.tickSpacing()

const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

const tickToPrice = (tick: number): number => 1.0001 ** tick;

const AddLiquidity = ({ params }: { params: { mode: string; selectedData: JSON } }) => {
  const { pool, baseAssetMinPriceTick, baseAssetMaxPriceTick } = useContext(MarketContext);
  const account = useAccount();
  const toast = useToast();

  const [depositAmount, setDepositAmount] = useState(0);
  const [lowPrice, setLowPrice] = useState(tickToPrice(baseAssetMinPriceTick));
  const [highPrice, setHighPrice] = useState(tickToPrice(baseAssetMaxPriceTick));
  const [baseToken, setBaseToken] = useState(0);
  const [quoteToken, setQuoteToken] = useState(0);

  const tickLower = priceToTick(lowPrice, tickSpacing);
  const tickUpper = priceToTick(highPrice, tickSpacing);

  const collateralAmountFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: CollateralAsset.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [account.address],
  });

  const [transactionStep, setTransactionStep] = useState(0);

  const { data: approveHash, writeContract: approveWrite } = useWriteContract();
  const { data: addLiquidityHash, writeContract: addLiquidityWrite } = useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isSuccess: addLiquiditySuccess } = useWaitForTransactionReceipt({ hash: addLiquidityHash });

  useEffect(() => {
    setLowPrice(tickToPrice(baseAssetMinPriceTick));
  }, [baseAssetMinPriceTick]);

  useEffect(() => {
    setHighPrice(tickToPrice(baseAssetMaxPriceTick));
  }, [baseAssetMaxPriceTick]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    approveWrite({
      abi: CollateralAsset.abi,
      address: CollateralAsset.address,
      functionName: 'approve',
      args: [CollateralAsset.address, BigInt(depositAmount)],
    });
    setTransactionStep(1);
  };

  useEffect(() => {
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2);
    }
  }, [approveSuccess, transactionStep]);

  useEffect(() => {
    if (transactionStep === 2) {
      addLiquidityWrite({
        address: Foil.address,
        abi: Foil.abi,
        functionName: 'createLiquidityPosition',
        args: [
          {
            accountId: BigInt(420), // Example accountId
            amountTokenA: BigInt(baseToken),
            amountTokenB: BigInt(quoteToken),
            collateralAmount: BigInt(depositAmount),
            lowerTick: BigInt(tickLower),
            upperTick: BigInt(tickUpper),
          },
        ],
      });
      setTransactionStep(3);
    }
  }, [transactionStep, addLiquidityWrite, baseToken, quoteToken, depositAmount, lowPrice, highPrice, tickLower, tickUpper]);

  useEffect(() => {
    if (pool) {
      const p = Position.fromAmount0({
        pool,
        tickLower,
        tickUpper,
        amount0: baseToken.toString(),
        useFullPrecision: true,
      });
      setQuoteToken(p.amount1.toSignificant());
    }
  }, [pool, baseToken, tickLower, tickUpper]);

  useEffect(() => {
    if (pool) {
      const p = Position.fromAmount1({
        pool,
        tickLower,
        tickUpper,
        amount1: quoteToken.toString(),
        useFullPrecision: true,
      });
      setBaseToken(p.amount0.toSignificant());
    }
  }, [pool, quoteToken, tickLower, tickUpper]);

  return (
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
            min={tickToPrice(baseAssetMinPriceTick)}
            max={tickToPrice(baseAssetMaxPriceTick)}
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
            min={tickToPrice(baseAssetMinPriceTick)}
            max={tickToPrice(baseAssetMaxPriceTick)}
          />
          <InputRightAddon>cbETH/Ggas</InputRightAddon>
        </InputGroup>
      </FormControl>
      <FormControl mb={4}>
        <FormLabel>Base Token (vGwei)</FormLabel>
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
        <FormLabel>Quote Token (vGas)</FormLabel>
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
          Net Position: {lowPrice.toFixed(2)} Ggas to {highPrice.toFixed(2)} Ggas
        </Text>
        <Text fontSize="sm" color="gray.500" mb="1">
          Wallet Balance: {collateralAmountFunctionResult?.data?.toString()} cbETH
        </Text>
      </Box>
      <Button
        width="full"
        variant="brand"
        type="submit"
        isLoading={transactionStep > 0 && transactionStep < 3}
        isDisabled={transactionStep > 0 && transactionStep < 3}
      >
        Add Liquidity
      </Button>
      {transactionStep === 3 && addLiquiditySuccess && (
        <Text fontSize="sm" color="green.500" mt="2">
          Liquidity added successfully!
        </Text>
      )}
    </form>
  );
};

export default AddLiquidity;
