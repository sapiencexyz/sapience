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
  RangeSlider,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  RangeSliderTrack,
  SliderMark,
  RangeSliderMark,
  Flex,
} from '@chakra-ui/react';
import { Position } from '@uniswap/v3-sdk';
import type { ReactNode } from 'react';
import { useContext, useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useSimulateContract,
} from 'wagmi';

import CollateralAsset from '../../../../deployments/CollateralAsset/Token.json';
import Foil from '../../../../deployments/Foil.json';
import { MarketContext } from "~/lib/context/MarketProvider";

import SlippageTolerance from "./slippageTolerance";

const tickSpacing = 200; // Hardcoded for now, should be retrieved with pool.tickSpacing()

const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

const tickToPrice = (tick: number): number => 1.0001 ** tick;

const AddLiquidity = () => {
  const {
    pool,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    collateralAssetTicker,
    collateralAssetDecimals,
  } = useContext(MarketContext);
  const account = useAccount();
  const chainId = 13370;
  const { isConnected } = account;

  const [depositAmount, setDepositAmount] = useState(0);
  const [lowPrice, setLowPrice] = useState(tickToPrice(baseAssetMinPriceTick));
  const [highPrice, setHighPrice] = useState(
    tickToPrice(baseAssetMaxPriceTick)
  );
  const [baseToken, setBaseToken] = useState(0);
  const [quoteToken, setQuoteToken] = useState(0);

  const tickLower = priceToTick(lowPrice, tickSpacing);
  const tickUpper = priceToTick(highPrice, tickSpacing);

  const collateralAmountFunctionResult = useReadContract({
    abi: CollateralAsset.abi,
    address: CollateralAsset.address as `0x${string}`,
    functionName: 'balanceOf',
    args: [account.address],
    chainId,
  });

  const [transactionStep, setTransactionStep] = useState(0);

  const { data: approveHash, writeContract: approveWrite } = useWriteContract();
  const { data: addLiquidityHash, writeContract: addLiquidityWrite } =
    useWriteContract();

  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isSuccess: addLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: addLiquidityHash,
  });

  useEffect(() => {
    setLowPrice(tickToPrice(baseAssetMinPriceTick));
  }, [baseAssetMinPriceTick]);

  useEffect(() => {
    setHighPrice(tickToPrice(baseAssetMaxPriceTick));
  }, [baseAssetMaxPriceTick]);

  const handleFormSubmit = (e: any) => {
    e.preventDefault();
    approveWrite({
      abi: CollateralAsset.abi,
      address: CollateralAsset.address as `0x${string}`,
      functionName: 'approve',
      args: [
        CollateralAsset.address,
        parseUnits(depositAmount.toString(), collateralAssetDecimals),
      ],
      chainId,
    });
    setTransactionStep(1);
  };

  useEffect(() => {
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2);
    }
  }, [approveSuccess, transactionStep]);

  const result = useSimulateContract({
    address: Foil.address as `0x${string}`,
    abi: Foil.abi,
    functionName: 'createLiquidityPosition',
    args: [
      {
        amountTokenA: BigInt(baseToken),
        amountTokenB: BigInt(quoteToken),
        collateralAmount: BigInt(depositAmount),
        lowerTick: BigInt(tickLower),
        upperTick: BigInt(tickUpper),
      },
    ],
    chainId,
  });
  console.log('result', result);

  useEffect(() => {
    if (transactionStep === 2) {
      console.log('Calling addLiquidityWrite with:', {
        address: Foil.address,
        abi: Foil.abi,
        functionName: 'createLiquidityPosition',
        args: [
          {
            amountTokenA: BigInt(baseToken),
            amountTokenB: BigInt(quoteToken),
            collateralAmount: BigInt(depositAmount),
            lowerTick: BigInt(tickLower),
            upperTick: BigInt(tickUpper),
          },
        ],
        chainId,
      });

      addLiquidityWrite({
        address: Foil.address as `0x${string}`,
        abi: Foil.abi,
        functionName: 'createLiquidityPosition',
        args: [
          {
            amountTokenA: BigInt(baseToken),
            amountTokenB: BigInt(quoteToken),
            collateralAmount: BigInt(depositAmount),
            lowerTick: BigInt(tickLower),
            upperTick: BigInt(tickUpper),
          },
        ],
        chainId,
      });
      setTransactionStep(3);
    }
  }, [
    transactionStep,
    addLiquidityWrite,
    baseToken,
    quoteToken,
    depositAmount,
    lowPrice,
    highPrice,
    tickLower,
    tickUpper,
  ]);

  const [slippage, setSlippage] = useState<number>(0.5);

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
    console.log(`Slippage tolerance updated to: ${newSlippage}%`);
  };

  /*
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
*/
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
          <InputRightAddon>{collateralAssetTicker}</InputRightAddon>
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
          <InputRightAddon>{collateralAssetTicker}/Ggas</InputRightAddon>
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
          <InputRightAddon>{collateralAssetTicker}/Ggas</InputRightAddon>
        </InputGroup>
      </FormControl>

      <Flex>
        <Box flex="auto">Recharts Histogram Here</Box>
        <FormControl>
          <RangeSlider
            aria-label={['min', 'max']}
            defaultValue={[10, 30]}
            orientation="vertical"
            minH="32"
          >
            <RangeSliderMark value={0} mb="-1" ml="3" fontSize="sm" w="90px">
              5 gwei
            </RangeSliderMark>

            <RangeSliderMark
              value={100}
              mb="-3.5"
              ml="3"
              fontSize="sm"
              w="90px"
            >
              100 gwei
            </RangeSliderMark>

            <RangeSliderTrack>
              <RangeSliderFilledTrack />
            </RangeSliderTrack>
            <RangeSliderThumb index={0} />
            <RangeSliderThumb index={1} />
          </RangeSlider>
        </FormControl>
      </Flex>
      <SlippageTolerance onSlippageChange={handleSlippageChange} />

      <Box mb="4">
        <Text fontSize="sm" color="gray.500" mb="0.5">
          Base Token: {baseToken} vGas
        </Text>
        <Text fontSize="sm" color="gray.500" mb="0.5">
          Quote Token: {quoteToken} vGwei
        </Text>
        <Text fontSize="sm" color="gray.500" mb="0.5">
          Net Position: {lowPrice.toFixed(2)} Ggas to {highPrice.toFixed(2)}{' '}
          Ggas
        </Text>
        {isConnected && collateralAmountFunctionResult?.data ? (
          <Text fontSize="sm" color="gray.500" mb="0.5">
            Wallet Balance:{' '}
            {formatUnits(
              BigInt(
                (collateralAmountFunctionResult.data as string).toString()
              ),
              collateralAssetDecimals
            )}{' '}
            {collateralAssetTicker}
          </Text>
        ) : (
          <></>
        )}
      </Box>
      {isConnected ? (
        <Button
          width="full"
          variant="brand"
          type="submit"
          isLoading={transactionStep > 0 && transactionStep < 3}
          isDisabled={transactionStep > 0 && transactionStep < 3}
        >
          Add Liquidity
        </Button>
      ) : (
        <Button width="full" variant="brand" type="submit">
          Connect Wallet
        </Button>
      )}
      {transactionStep === 3 && addLiquiditySuccess && (
        <Text fontSize="sm" color="green.500" mt="2">
          Liquidity added successfully!
        </Text>
      )}
    </form>
  );
};

export default AddLiquidity;
