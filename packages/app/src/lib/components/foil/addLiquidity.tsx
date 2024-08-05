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
  RangeSliderMark,
  Flex,
} from '@chakra-ui/react';
import { useContext, useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useSimulateContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';

import SlippageTolerance from './slippageTolerance';
import useFoilDeployment from './useFoilDeployment';

import { MarketContext } from '~/lib/context/MarketProvider';

const tickSpacingDefault = 200; // 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()

const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

const tickToPrice = (tick: number): number => 1.0001 ** tick;

const AddLiquidity = () => {
  const {
    pool,
    chain,
    collateralAsset,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    collateralAssetTicker,
    collateralAssetDecimals,
  } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);

  const account = useAccount();
  const { isConnected } = account;

  const [depositAmount, setDepositAmount] = useState(0);
  const [lowPrice, setLowPrice] = useState(tickToPrice(baseAssetMinPriceTick));
  const [highPrice, setHighPrice] = useState(
    tickToPrice(baseAssetMaxPriceTick)
  );
  const [baseToken, setBaseToken] = useState(0);
  const [quoteToken, setQuoteToken] = useState(0);
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [walletBalanceAfter, setWalletBalanceAfter] = useState<string | null>(
    null
  );
  const [minAmountTokenA, setMinAmountTokenA] = useState(0);
  const [minAmountTokenB, setMinAmountTokenB] = useState(0);
  const [slippage, setSlippage] = useState<number>(0.5);
  const [allowance, setAllowance] = useState<string | null>(null);

  const tickLower = priceToTick(lowPrice, tickSpacingDefault);
  const tickUpper = priceToTick(highPrice, tickSpacingDefault);

  const { data: collateralAmountData, refetch: refetchCollateralAmount } =
    useReadContract({
      abi: erc20ABI,
      address: collateralAsset as `0x${string}`,
      functionName: 'balanceOf',
      args: [account.address],
      chainId: chain?.id,
    });

  const { data: allowanceData } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [account.address, foilData.address],
    chainId: chain?.id,
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

  useEffect(() => {
    if (collateralAmountData) {
      const formattedBalance = formatUnits(
        BigInt(collateralAmountData.toString()),
        collateralAssetDecimals
      );
      setWalletBalance(formattedBalance);
      setWalletBalanceAfter(
        (
          parseFloat(formattedBalance) - parseFloat(depositAmount.toString())
        ).toFixed(collateralAssetDecimals)
      );
    }
  }, [collateralAmountData, collateralAssetDecimals, depositAmount]);

  useEffect(() => {
    const amountTokenA = Math.floor(baseToken);
    const amountTokenB = Math.floor(quoteToken);
    const minTokenA = (amountTokenA * (100 - slippage)) / 100;
    const minTokenB = (amountTokenB * (100 - slippage)) / 100;
    setMinAmountTokenA(minTokenA);
    setMinAmountTokenB(minTokenB);
  }, [baseToken, quoteToken, slippage]);

  useEffect(() => {
    if (allowanceData) {
      const formattedAllowance = formatUnits(
        BigInt(allowanceData.toString()),
        collateralAssetDecimals
      );
      setAllowance(formattedAllowance);
    }
  }, [allowanceData, collateralAssetDecimals]);

  const {
    data: tokenAmounts,
    error,
    status,
  } = useReadContract({
    address: foilData.address,
    abi: foilData.abi,
    functionName: 'getTokenAmounts',
    args: [
      parseUnits(depositAmount.toString(), collateralAssetDecimals), // uint256 collateralAmount
      pool ? pool.sqrtRatioX96.toString() : '0', // uint160 sqrtPriceX96, // current price of pool
      BigInt(Math.sqrt(tickLower) * 2 ** 96), // uint160 sqrtPriceAX96, // lower tick price in sqrtRatio
      BigInt(Math.sqrt(tickUpper) * 2 ** 96), // uint160 sqrtPriceBX96 // upper tick price in sqrtRatio
    ],
    chainId: chain?.id,
  });

  useEffect(() => {
    if (tokenAmounts) {
      const { amount0, amount1 } = tokenAmounts;
      setBaseToken(parseFloat(formatUnits(amount0, 18)));
      setQuoteToken(parseFloat(formatUnits(amount1, 18)));
    }

    if (error) {
      console.error('Failed to fetch token amounts', error);
    }
  }, [tokenAmounts, error]);

  const handleFormSubmit = (e: any) => {
    e.preventDefault();

    if (
      allowance &&
      parseFloat(allowance) >= parseFloat(depositAmount.toString())
    ) {
      setTransactionStep(2); // Skip approve and go directly to add liquidity
    } else {
      approveWrite({
        abi: erc20ABI,
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [
          foilData.address,
          parseUnits(depositAmount.toString(), collateralAssetDecimals),
        ],
        chainId: chain?.id,
      });
      setTransactionStep(1);
    }
  };

  const handleDepositAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(e.target.value);
    console.log('Setting depositAmount:', value);
    setDepositAmount(value);
  };

  useEffect(() => {
    console.log('Deposit amount changed:', depositAmount);
    // The following lines have been removed as they are redundant:
    // const newBaseToken = depositAmount * 0.001;
    // const newQuoteToken = depositAmount * 0.001;
    // setBaseToken(newBaseToken);
    // setQuoteToken(newQuoteToken);
  }, [depositAmount]);

  useEffect(() => {
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2);
    }
  }, [approveSuccess, transactionStep]);

  const result = useSimulateContract({
    address: foilData.address as `0x${string}`,
    abi: foilData.abi,
    functionName: 'createLiquidityPosition',
    args: [
      {
        amountTokenA: parseUnits(baseToken.toString(), 18),
        amountTokenB: parseUnits(quoteToken.toString(), 18),
        collateralAmount: parseUnits(
          depositAmount.toString(),
          collateralAssetDecimals
        ),
        lowerTick: BigInt(tickLower),
        upperTick: BigInt(tickUpper),
        minAmountTokenA: parseUnits(minAmountTokenA.toString(), 18),
        minAmountTokenB: parseUnits(minAmountTokenB.toString(), 18),
      },
    ],
    chainId: chain?.id,
  });
  console.log('result', result, [
    {
      amountTokenA: parseUnits(baseToken.toString(), 18),
      amountTokenB: parseUnits(quoteToken.toString(), 18),
      collateralAmount: parseUnits(
        depositAmount.toString(),
        collateralAssetDecimals
      ),
      lowerTick: BigInt(tickLower),
      upperTick: BigInt(tickUpper),
      minAmountTokenA: parseUnits(minAmountTokenA.toString(), 18),
      minAmountTokenB: parseUnits(minAmountTokenB.toString(), 18),
    },
  ]);

  useEffect(() => {
    if (transactionStep === 2) {
      addLiquidityWrite({
        address: foilData.address as `0x${string}`,
        abi: foilData.abi,
        functionName: 'createLiquidityPosition',
        args: [
          {
            amountTokenA: parseUnits(baseToken.toString(), 18),
            amountTokenB: parseUnits(quoteToken.toString(), 18),
            collateralAmount: parseUnits(
              depositAmount.toString(),
              collateralAssetDecimals
            ),
            lowerTick: BigInt(tickLower),
            upperTick: BigInt(tickUpper),
            minAmountTokenA: parseUnits(minAmountTokenA.toString(), 18),
            minAmountTokenB: parseUnits(minAmountTokenB.toString(), 18),
          },
        ],
        chainId: chain?.id,
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
    foilData,
    chain,
    slippage,
    minAmountTokenA,
    minAmountTokenB,
    collateralAssetDecimals,
  ]);

  useEffect(() => {
    if (addLiquiditySuccess && transactionStep === 3) {
      refetchCollateralAmount();
      setTransactionStep(4);
    }
  }, [addLiquiditySuccess, transactionStep, refetchCollateralAmount]);

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
    console.log(`Slippage tolerance updated to: ${newSlippage}%`);
  };

  return (
    <form onSubmit={handleFormSubmit}>
      <FormControl mb={4}>
        <FormLabel>Collateral Amount</FormLabel>
        <InputGroup>
          <Input
            type="number"
            value={depositAmount}
            onChange={handleDepositAmountChange}
          />
          <InputRightAddon>{collateralAssetTicker}</InputRightAddon>
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

      <Flex display="none">
        <Box flex="auto">Recharts Histogram Here</Box>
        <FormControl>
          <RangeSlider defaultValue={[10, 30]} orientation="vertical" minH="32">
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
          Est. Base Token Amt.: {baseToken} vGas (min:{' '}
          {minAmountTokenA.toFixed(2)})
        </Text>
        <Text fontSize="sm" color="gray.500" mb="0.5">
          Est. Quote Token Amt.: {quoteToken} vGwei (min:{' '}
          {minAmountTokenB.toFixed(2)})
        </Text>
        <Text fontSize="sm" color="gray.500" mb="0.5">
          Net Position: {highPrice.toFixed(2)} Ggas
        </Text>
        {isConnected &&
        walletBalance !== null &&
        walletBalanceAfter !== null ? (
          <Text fontSize="sm" color="gray.500" mb="0.5">
            Wallet Balance: {walletBalance} {collateralAssetTicker} →{' '}
            {walletBalanceAfter} {collateralAssetTicker}
          </Text>
        ) : null}
      </Box>
      {isConnected ? (
        <Button
          width="full"
          variant="brand"
          type="submit"
          isLoading={transactionStep > 0 && transactionStep < 4}
          isDisabled={transactionStep > 0 && transactionStep < 4}
        >
          Add Liquidity
        </Button>
      ) : (
        <Button width="full" variant="brand" type="submit">
          Connect Wallet
        </Button>
      )}
      {transactionStep === 4 && addLiquiditySuccess && (
        <Text fontSize="sm" color="green.500" mt="2">
          Liquidity added successfully!
        </Text>
      )}
    </form>
  );
};

export default AddLiquidity;
