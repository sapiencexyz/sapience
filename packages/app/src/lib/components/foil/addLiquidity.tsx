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
import INONFUNGIBLE_POSITION_MANAGER from '@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json';
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

const TOKEN_DECIMALS = 18; // should be retrieved from the contract?
const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

const tickToPrice = (tick: number): number => 1.0001 ** tick;

interface Props {
  refetch: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<unknown, ReadContractErrorType>>;
  nftId: number;
}

const AddLiquidity: React.FC<Props> = ({ nftId, refetch }) => {
  const {
    epoch,
    pool,
    chain,
    collateralAsset,
    baseAssetMinPriceTick,
    uniswapPositionManagerAddress,
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
  const [slippage, setSlippage] = useState<number>(0.5);
  const [transactionStep, setTransactionStep] = useState(0);

  const tickLower = priceToTick(lowPrice, tickSpacingDefault);
  const tickUpper = priceToTick(highPrice, tickSpacingDefault);
  const isEdit = nftId > 0;

  /////// READ CONTRACT HOOKS ///////
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getPosition',
    args: [nftId],
    query: {
      enabled: isEdit,
    },
  }) as { data: FoilPosition; refetch: () => void };

  const {
    data: uniswapPosition,
    error: uniswapPositionError,
    isLoading: uniswapPositionLoading,
  } = useReadContract({
    abi: INONFUNGIBLE_POSITION_MANAGER.abi,
    address: uniswapPositionManagerAddress,
    functionName: 'positions',
    args: [positionData?.tokenId.toString()],
    query: {
      enabled: Boolean(
        uniswapPositionManagerAddress != '0x' && positionData?.tokenId
      ),
    },
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
    query: {
      enabled: Boolean(isConnected && foilData.address),
    },
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
    query: {
      enabled: Boolean(pool),
    },
  });

  /////// WRITE CONTRACT HOOKS ///////
  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        renderContractErrorToast(
          error as WriteContractErrorType,
          toast,
          'Failed to approve'
        );
        setTransactionStep(0);
      },
    },
  });

  const { data: addLiquidityHash, writeContract: addLiquidityWrite } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          renderContractErrorToast(
            error as WriteContractErrorType,
            toast,
            'Failed to add liquidity'
          );
          setTransactionStep(0);
        },
      },
    });

  const { data: increaseLiquidityHash, writeContract: increaseLiquidity } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          renderContractErrorToast(
            error as WriteContractErrorType,
            toast,
            'Failed to increase liquidity'
          );
          setTransactionStep(0);
        },
      },
    });

  const { data: decreaseLiqudiityHash, writeContract: decreaseLiquidity } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          renderContractErrorToast(
            error as WriteContractErrorType,
            toast,
            'Failed to decrease liquidity'
          );
          setTransactionStep(0);
        },
      },
    });

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
  const { isSuccess: decreaseLiquiditySuccess, isLoading: isLoadingDecrease } =
    useWaitForTransactionReceipt({
      hash: decreaseLiqudiityHash,
    });

  useEffect(() => {
    console.log('decreaseLiquiditySuccess -', decreaseLiquiditySuccess);
  }, [decreaseLiquiditySuccess]);

  //////// MEMOIZED VALUES ////////
  const liquidity: undefined | bigint = useMemo(() => {
    if (!uniswapPosition) return;
    const uniswapData = uniswapPosition as any[];
    return uniswapData[7];
  }, [uniswapPosition]);

  const positionCollateralAmount = useMemo(() => {
    if (!positionData) return 0;
    return Number(
      formatUnits(
        positionData.depositedCollateralAmount,
        collateralAssetDecimals
      )
    );
  }, [positionData, collateralAssetDecimals]);
  const isDecrease = isEdit && depositAmount < positionCollateralAmount;

  // same as token0/tokenA/gasToken
  const baseToken = useMemo(() => {
    const tokenAmountsAny = tokenAmounts as any[]; // there's some abitype project, i think
    if (!tokenAmountsAny) return 0;
    const amount0 = tokenAmountsAny[0];
    return parseFloat(formatUnits(amount0, TOKEN_DECIMALS));
  }, [tokenAmounts]);

  // same as token/tokenB/ethToken
  const quoteToken = useMemo(() => {
    const tokenAmountsAny = tokenAmounts as any[]; // there's some abitype project, i think
    if (!tokenAmountsAny) return 0;
    const amount1 = tokenAmountsAny[1];
    return parseFloat(formatUnits(amount1, TOKEN_DECIMALS));
  }, [tokenAmounts]);

  // same as min token0/baseToken/gasToken
  const minAmountTokenA = useMemo(() => {
    return (baseToken * (100 - slippage)) / 100;
  }, [baseToken, slippage]);

  // same as min token1/quoteToken/ethToken
  const minAmountTokenB = useMemo(() => {
    return (quoteToken * (100 - slippage)) / 100;
  }, [quoteToken, slippage]);

  const walletBalance = useMemo(() => {
    if (!collateralAmountData) return null;
    return formatUnits(
      BigInt(collateralAmountData.toString()),
      collateralAssetDecimals
    );
  }, [collateralAmountData, collateralAssetDecimals]);

  const walletBalanceAfter = useMemo(() => {
    if (!walletBalance) return null;
    return (
      parseFloat(walletBalance) - parseFloat(depositAmount.toString())
    ).toPrecision(3);
  }, [walletBalance, depositAmount]);

  const allowance = useMemo(() => {
    if (!allowanceData) return null;
    return formatUnits(
      BigInt(allowanceData.toString()),
      collateralAssetDecimals
    );
  }, [allowanceData, collateralAssetDecimals]);

  /////// USE EFFECTS ///////
  // handle token amounts error
  useEffect(() => {
    renderContractErrorToast(
      tokenAmountsError,
      toast,
      'Failed to fetch token amounts'
    );
  }, [tokenAmountsError]);

  // hanlde uniswap error
  useEffect(() => {
    renderContractErrorToast(
      uniswapPositionError,
      toast,
      'Failed to get position from uniswap'
    );
  }, [uniswapPositionError]);

  useEffect(() => {
    setLowPrice(tickToPrice(baseAssetMinPriceTick));
  }, [baseAssetMinPriceTick]);

  useEffect(() => {
    setHighPrice(tickToPrice(baseAssetMaxPriceTick));
  }, [baseAssetMaxPriceTick]);

  useEffect(() => {
    if (approveSuccess && transactionStep === 1) {
      setTransactionStep(2);
    }
  }, [approveSuccess, transactionStep]);

  useEffect(() => {
    if (transactionStep === 2) {
      if (isEdit) {
        if (isDecrease) {
          handleDecreaseLiquidty();
        } else {
          handleIncreaseLiquidity();
        }
      } else {
        addLiquidityWrite({
          address: foilData.address as `0x${string}`,
          abi: foilData.abi,
          functionName: 'createLiquidityPosition',
          args: [
            {
              epochId: epoch,
              amountTokenA: parseUnits(baseToken.toString(), TOKEN_DECIMALS),
              amountTokenB: parseUnits(quoteToken.toString(), TOKEN_DECIMALS),
              collateralAmount: parseUnits(
                depositAmount.toString(),
                collateralAssetDecimals
              ),
              lowerTick: BigInt(tickLower),
              upperTick: BigInt(tickUpper),
              minAmountTokenA: parseUnits(
                minAmountTokenA.toString(),
                TOKEN_DECIMALS
              ),
              minAmountTokenB: parseUnits(
                minAmountTokenB.toString(),
                TOKEN_DECIMALS
              ),
            },
          ],
          chainId: chain?.id,
        });
      }

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
    if (
      (addLiquiditySuccess || increaseLiquiditySuccess) &&
      transactionStep === 3
    ) {
      refetchCollateralAmount();
      refetch();
      refetchPosition();
      setTransactionStep(4);
    }
  }, [
    addLiquiditySuccess,
    transactionStep,
    refetchCollateralAmount,
    increaseLiquiditySuccess,
  ]);

  ////// HANDLERS //////
  /**
   * Handle updating slippage tolerance
   * @param newSlippage - new slippage value
   */
  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
  };

  const ratio = depositAmount / positionCollateralAmount;
  const newLiquidity = Math.floor(Number(liquidity) * ratio);
  const handleDecreaseLiquidty = () => {
    if (!liquidity) return;
    const ratio = depositAmount / positionCollateralAmount;
    const formattedLiq = formatUnits(liquidity, collateralAssetDecimals);
    const newLiq = Number(formattedLiq) * ratio;
    const parsedNewLiq = parseUnits(newLiq.toString(), collateralAssetDecimals);
    const dummyNewLiq = parseUnits('0', collateralAssetDecimals);
    console.log('newLiq', newLiq);
    console.log('parsedNewLiq', parsedNewLiq);
    console.log('dummy liq', dummyNewLiq);
    // return;

    decreaseLiquidity({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'decreaseLiquidityPosition',
      args: [
        nftId,
        parseUnits(depositAmount.toString(), collateralAssetDecimals),
        parsedNewLiq,
        parseUnits(minAmountTokenA.toString(), TOKEN_DECIMALS),
        parseUnits(minAmountTokenB.toString(), TOKEN_DECIMALS),
      ],
      chainId: chain?.id,
    });
  };

  /**
   * handle increasing liquidity position
   */
  const handleIncreaseLiquidity = () => {
    increaseLiquidity({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'increaseLiquidityPosition',
      args: [
        nftId,
        parseUnits(depositAmount.toString(), collateralAssetDecimals),
        parseUnits(baseToken.toString(), TOKEN_DECIMALS),
        parseUnits(quoteToken.toString(), TOKEN_DECIMALS),
        parseUnits(minAmountTokenA.toString(), TOKEN_DECIMALS),
        parseUnits(minAmountTokenB.toString(), TOKEN_DECIMALS),
      ],
      chainId: chain?.id,
    });
  };

  /**
   * hanlde creating liquidity position
   */
  const handleCreateLiquidity = () => {
    if (
      !isDecrease &&
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

  const handleFormSubmit = (e: any) => {
    e.preventDefault();
    //  handleCreateLiquidity();
    if (isEdit && isDecrease) {
      handleDecreaseLiquidty();
    } else {
      handleCreateLiquidity();
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
          Original Amount: {positionCollateralAmount} ratio {ratio}
        </Text>
        <Text fontSize={'small'} hidden={!isEdit}>
          deposit amount{' '}
          {`${parseUnits(depositAmount.toString(), collateralAssetDecimals)}`}
        </Text>
        <Text fontSize={'small'} hidden={!isEdit}>
          original amount{' '}
          {`${parseUnits(positionCollateralAmount.toString(), collateralAssetDecimals)}`}
        </Text>
        <Text>Liq - {Number(liquidity)?.toString()}</Text>
        <Text>New Liq - {newLiquidity}</Text>
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
          Est. Base Token Amt.: {baseToken.toPrecision(3)} vGas (min:{' '}
          {minAmountTokenA.toPrecision(3)})
        </Text>
        <Text fontSize="sm" color="gray.500" mb="0.5">
          Est. Quote Token Amt.: {quoteToken.toPrecision(3)} vGwei (min:{' '}
          {minAmountTokenB.toPrecision(3)})
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
      {transactionStep === 4 &&
        (addLiquiditySuccess || increaseLiquiditySuccess) && (
          <Text fontSize="sm" color="green.500" mt="2">
            Liquidity added successfully!
          </Text>
        )}
    </form>
  );
};

export default AddLiquidity;
