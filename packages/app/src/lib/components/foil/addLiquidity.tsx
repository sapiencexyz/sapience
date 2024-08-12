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
  useToast,
} from '@chakra-ui/react';
import { TickMath } from '@uniswap/v3-sdk';
import { useContext, useEffect, useMemo, useState } from 'react';
import {
  formatUnits,
  parseUnits,
  ReadContractErrorType,
  WriteContractErrorType,
} from 'viem';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';

import SlippageTolerance from './slippageTolerance';
import useFoilDeployment from './useFoilDeployment';

import { MarketContext } from '~/lib/context/MarketProvider';
import { FoilPosition } from '~/lib/interfaces/interfaces';
import { renderContractErrorToast } from '../util/util';
import { QueryObserverResult, RefetchOptions } from '@tanstack/react-query';

const tickSpacingDefault = 200; // 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()

const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

const tickToPrice = (tick: number): number => 1.0001 ** tick;

interface Props {
  refetch: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<unknown, ReadContractErrorType>>;
  nftId?: number;
}

const AddLiquidity: React.FC<Props> = ({ nftId, refetch }) => {
  const {
    epoch,
    pool,
    chain,
    collateralAsset,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    collateralAssetTicker,
    collateralAssetDecimals,
  } = useContext(MarketContext);
  const { foilData } = useFoilDeployment(chain?.id);
  const toast = useToast();
  const account = useAccount();
  const { isConnected } = account;

  const [depositAmount, setDepositAmount] = useState(0);
  const [lowPrice, setLowPrice] = useState(tickToPrice(baseAssetMinPriceTick));
  const [highPrice, setHighPrice] = useState(
    tickToPrice(baseAssetMaxPriceTick)
  );
  const [walletBalance, setWalletBalance] = useState<string | null>(null);
  const [walletBalanceAfter, setWalletBalanceAfter] = useState<string | null>(
    null
  );
  const [slippage, setSlippage] = useState<number>(0.5);
  const [allowance, setAllowance] = useState<string | null>(null);
  const [transactionStep, setTransactionStep] = useState(0);

  const tickLower = priceToTick(lowPrice, tickSpacingDefault);
  const tickUpper = priceToTick(highPrice, tickSpacingDefault);
  const isEdit = !!nftId;

  /////// READ CONTRACT HOOKS ///////
  const { data: positionData }: { data: FoilPosition | undefined } =
    useReadContract({
      abi: foilData.abi,
      address: foilData.address as `0x${string}`,
      functionName: 'getPosition',
      args: [nftId || 0],
    });

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

  const { data: tokenAmounts, error: tokenAmountsError } = useReadContract({
    address: foilData.address,
    abi: foilData.abi,
    functionName: 'getTokenAmounts',
    args: [
      epoch.toString(),
      parseUnits(depositAmount.toString(), collateralAssetDecimals), // uint256 collateralAmount
      pool ? pool.sqrtRatioX96.toString() : '0', // uint160 sqrtPriceX96, // current price of pool
      TickMath.getSqrtRatioAtTick(tickLower).toString(), // uint160 sqrtPriceAX96, // lower tick price in sqrtRatio
      TickMath.getSqrtRatioAtTick(tickUpper).toString(), // uint160 sqrtPriceBX96 // upper tick price in sqrtRatio
    ],
    chainId: chain?.id,
  });

  /////// WRITE CONTRACT HOOKS ///////
  const {
    data: approveHash,
    writeContract: approveWrite,
    error: approveError,
  } = useWriteContract();
  const {
    data: addLiquidityHash,
    writeContract: addLiquidityWrite,
    error: addLiquidityError,
  } = useWriteContract();

  const {
    data: increaseLiquidityHash,
    writeContract: increaseLiquidity,
    error: increaseLiquidityError,
  } = useWriteContract();

  /////// WAIT FOR TRANSACTION RECEIPT HOOKS ///////
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isSuccess: addLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: addLiquidityHash,
  });

  const { isSuccess: increaseLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: increaseLiquidityHash,
  });

  //////// MEMOIZED VALUES ////////
  const positionCollateralAmount = useMemo(() => {
    if (!positionData) return 0;
    return Number(
      formatUnits(
        positionData.depositedCollateralAmount,
        collateralAssetDecimals
      )
    );
  }, [positionData, collateralAssetDecimals]);
  const isDecrease = depositAmount < positionCollateralAmount;

  const baseToken = useMemo(() => {
    const tokenAmountsAny = tokenAmounts as any[]; // there's some abitype project, i think
    if (!tokenAmountsAny) return 0;
    const amount0 = tokenAmountsAny[0];
    return parseFloat(formatUnits(amount0, 18));
  }, [tokenAmounts]);

  const quoteToken = useMemo(() => {
    const tokenAmountsAny = tokenAmounts as any[]; // there's some abitype project, i think
    if (!tokenAmountsAny) return 0;
    const amount1 = tokenAmountsAny[1];
    return parseFloat(formatUnits(amount1, 18));
  }, [tokenAmounts]);

  const minAmountTokenA = useMemo(() => {
    const amountTokenA = Math.floor(baseToken);
    return (amountTokenA * (100 - slippage)) / 100;
  }, [baseToken, slippage]);

  const minAmountTokenB = useMemo(() => {
    const amountTokenB = Math.floor(quoteToken);
    return (amountTokenB * (100 - slippage)) / 100;
  }, [quoteToken, slippage]);

  /////// USE EFFECTS ///////
  // handle liquidity error
  useEffect(() => {
    renderContractErrorToast(
      addLiquidityError as WriteContractErrorType,
      toast,
      'Failed to add liquidity'
    );
    if (addLiquidityError) {
      setTransactionStep(0);
    }
  }, [addLiquidityError]);
  // handle approval error
  useEffect(() => {
    renderContractErrorToast(
      approveError as WriteContractErrorType,
      toast,
      'Failed to approve'
    );
    if (approveError) {
      setTransactionStep(0);
    }
  }, [approveError]);

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
    if (allowanceData) {
      const formattedAllowance = formatUnits(
        BigInt(allowanceData.toString()),
        collateralAssetDecimals
      );
      setAllowance(formattedAllowance);
    }
  }, [allowanceData, collateralAssetDecimals]);

  useEffect(() => {
    renderContractErrorToast(
      tokenAmountsError,
      toast,
      'Failed to fetch token amounts'
    );
  }, [tokenAmountsError]);

  useEffect(() => {
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2);
    }
  }, [approveSuccess, transactionStep]);

  useEffect(() => {
    if (transactionStep === 2) {
      addLiquidityWrite({
        address: foilData.address as `0x${string}`,
        abi: foilData.abi,
        functionName: 'createLiquidityPosition',
        args: [
          {
            epochId: epoch,
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
    epoch,
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
      refetch();
      setTransactionStep(4);
    }
  }, [addLiquiditySuccess, transactionStep, refetchCollateralAmount]);

  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
  };

  const handleEditLiquidity = () => {};

  const handleIncreaseLiquidity = () => {
    increaseLiquidity({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'increaseLiquidityPosition',
      args: [
        nftId || 0,
        parseUnits(depositAmount.toString(), collateralAssetDecimals),
      ],
    });
  };

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

  return (
    <form onSubmit={handleFormSubmit}>
      <Box mb={4}>
        <FormControl>
          <FormLabel>{isEdit ? 'New ' : ''}Collateral Amount</FormLabel>
          <InputGroup>
            <Input
              type="number"
              value={depositAmount}
              onChange={handleDepositAmountChange}
            />
            <InputRightAddon>{collateralAssetTicker}</InputRightAddon>
          </InputGroup>
        </FormControl>
        <Text fontSize={'small'} hidden={!isEdit}>
          Original Amount: {positionCollateralAmount}
        </Text>
      </Box>
      <FormControl mb={4}>
        <FormLabel>Low Price</FormLabel>
        <InputGroup>
          <Input
            type="number"
            disabled={isEdit}
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
            disabled={isEdit}
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
          Net Position: X Ggas
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
          {isEdit && isDecrease ? 'Decrease' : 'Add'} Liquidity
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
