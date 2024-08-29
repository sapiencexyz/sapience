'use client';

// eslint-disable-next-line import/no-extraneous-dependencies
import INONFUNGIBLE_POSITION_MANAGER from '@/protocol/deployments/13370/Uniswap.NonfungiblePositionManager.json';
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
import type {
  QueryObserverResult,
  RefetchOptions,
} from '@tanstack/react-query';
import { TickMath } from '@uniswap/v3-sdk';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { ReadContractErrorType, WriteContractErrorType } from 'viem';
import { formatUnits, parseUnits } from 'viem';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import { getNewLiquidity } from '../../util/positionUtil';
import { renderContractErrorToast, renderToast } from '../../util/util';
import { TOKEN_DECIMALS } from '~/lib/constants/constants';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

import SlippageTolerance from './slippageTolerance';

const tickSpacingDefault = 200; // 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()

const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

const tickToPrice = (tick: number): number => 1.0001 ** tick;

interface Props {
  refetchTokens: (
    options?: RefetchOptions
  ) => Promise<QueryObserverResult<unknown, ReadContractErrorType>>;
  nftId: number;
}

const AddEditLiquidity: React.FC<Props> = ({ nftId, refetchTokens }) => {
  const {
    epoch,
    pool,
    collateralAsset,
    baseAssetMinPriceTick,
    uniswapPositionManagerAddress,
    baseAssetMaxPriceTick,
    collateralAssetTicker,
    collateralAssetDecimals,
    chainId,
    foilData,
  } = useContext(MarketContext);
  const { setIsLoading } = useLoading();
  const toast = useToast();
  const account = useAccount();
  const { isConnected } = account;

  const [depositAmount, setDepositAmount] = useState(0);
  const [lowPrice, setLowPrice] = useState(tickToPrice(baseAssetMinPriceTick));
  const [highPrice, setHighPrice] = useState(
    tickToPrice(baseAssetMaxPriceTick)
  );
  const [txnStep, setTxnStep] = useState<number>(0);
  const [slippage, setSlippage] = useState<number>(0.5);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [txnSuccessMsg, setTxnSuccessMsg] = useState('');

  const tickLower = priceToTick(lowPrice, tickSpacingDefault);
  const tickUpper = priceToTick(highPrice, tickSpacingDefault);
  const isEdit = nftId > 0;

  const [collateralAmountDelta, setCollateralAmountDelta] = useState<bigint>(
    BigInt(0)
  );

  /// //// READ CONTRACT HOOKS ///////
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    abi: foilData.abi,
    address: foilData.address as `0x${string}`,
    functionName: 'getPosition',
    args: [nftId],
    query: {
      enabled: isEdit,
    },
    chainId,
  }) as { data: FoilPosition; refetch: any; isRefetching: boolean };

  const { data: uniswapPosition, error: uniswapPositionError } =
    useReadContract({
      abi: INONFUNGIBLE_POSITION_MANAGER.abi,
      address: uniswapPositionManagerAddress,
      functionName: 'positions',
      args: [positionData?.id],
      query: {
        enabled: Boolean(
          uniswapPositionManagerAddress !== '0x' && positionData?.id && isEdit
        ),
      },
      chainId,
    });

  const { data: collateralAmountData, refetch: refetchCollateralAmount } =
    useReadContract({
      abi: erc20ABI,
      address: collateralAsset as `0x${string}`,
      functionName: 'balanceOf',
      args: [account.address],
      chainId,
    });

  const { data: allowanceData } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [account.address, foilData.address],
    query: {
      enabled: Boolean(isConnected && foilData.address),
    },
    chainId,
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
    chainId,
    query: {
      enabled: Boolean(pool),
    },
  });

  const { data: deltaTokenAmounts, error: deltaTokenAmountsError } =
    useReadContract({
      address: foilData.address,
      abi: foilData.abi,
      functionName: 'getTokenAmounts',
      args: [
        epoch.toString(),
        collateralAmountDelta, // uint256 collateralAmount
        pool ? pool.sqrtRatioX96.toString() : '0', // uint160 sqrtPriceX96, // current price of pool
        TickMath.getSqrtRatioAtTick(tickLower).toString(), // uint160 sqrtPriceAX96, // lower tick price in sqrtRatio
        TickMath.getSqrtRatioAtTick(tickUpper).toString(), // uint160 sqrtPriceBX96 // upper tick price in sqrtRatio
      ],
      chainId,
      query: {
        enabled: Boolean(pool),
      },
    }) as {
      data: [bigint, bigint, bigint];
      error: any;
    };

  /// //// WRITE CONTRACT HOOKS ///////
  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        resetAfterError();
        renderContractErrorToast(
          error as WriteContractErrorType,
          toast,
          'Failed to approve'
        );
      },
    },
  });

  const { data: addLiquidityHash, writeContract: addLiquidityWrite } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          resetAfterError();
          renderContractErrorToast(
            error as WriteContractErrorType,
            toast,
            'Failed to add liquidity'
          );
        },
      },
    });

  const { data: increaseLiquidityHash, writeContract: increaseLiquidity } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          resetAfterError();
          renderContractErrorToast(
            error as WriteContractErrorType,
            toast,
            'Failed to increase liquidity'
          );
        },
      },
    });

  const { data: decreaseLiqudiityHash, writeContract: decreaseLiquidity } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          resetAfterError();
          renderContractErrorToast(
            error as WriteContractErrorType,
            toast,
            'Failed to decrease liquidity'
          );
        },
      },
    });

  /// //// WAIT FOR TRANSACTION RECEIPT HOOKS ///////
  const { isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  const { isSuccess: addLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: addLiquidityHash,
  });

  const { isSuccess: increaseLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: increaseLiquidityHash,
  });
  const { isSuccess: decreaseLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: decreaseLiqudiityHash,
  });

  /// ///// MEMOIZED VALUES ////////
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

  const newLiquidity: bigint = useMemo(() => {
    if (!liquidity) return BigInt(0);
    return getNewLiquidity(
      depositAmount,
      positionCollateralAmount,
      collateralAssetDecimals,
      liquidity
    );
  }, [
    depositAmount,
    positionCollateralAmount,
    collateralAssetDecimals,
    liquidity,
  ]);

  // same delta token0/gasToken
  const baseTokenDelta = useMemo(() => {
    if (!deltaTokenAmounts) return BigInt('0');
    return deltaTokenAmounts[0];
  }, [deltaTokenAmounts]);

  // same as delta token1/ethToken
  const quoteTokenDelta = useMemo(() => {
    if (!deltaTokenAmounts) return BigInt('0');
    return deltaTokenAmounts[1];
  }, [deltaTokenAmounts]);

  // same as min delta token0/baseToken/gasToken
  const minAmountBaseTokenDelta = useMemo(() => {
    const numerator = BigInt(100 * 100) - BigInt(slippage * 100);
    const denominator = BigInt(100 * 100);
    return (baseTokenDelta * numerator) / denominator;
  }, [baseTokenDelta, slippage]);

  // same as min delta token1/quoteToken/ethToken
  const minAmountQuoteTokenDelta = useMemo(() => {
    const numerator = BigInt(100 * 100) - BigInt(slippage * 100);
    const denominator = BigInt(100 * 100);
    return (quoteTokenDelta * numerator) / denominator;
  }, [quoteTokenDelta, slippage]);

  const baseToken = useMemo(() => {
    const tokenAmountsAny = tokenAmounts as any[]; // there's some abitype project, i think
    if (!tokenAmountsAny) return 0;
    const amount0 = tokenAmountsAny[0];
    return parseFloat(formatUnits(amount0, TOKEN_DECIMALS));
  }, [tokenAmounts]);

  // same as token1/tokenB/ethToken
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
    const delta = parseFloat(
      formatUnits(collateralAmountDelta, collateralAssetDecimals)
    );
    return (parseFloat(walletBalance) - delta).toPrecision(3);
  }, [walletBalance, collateralAmountDelta, collateralAssetDecimals]);

  const allowance = useMemo(() => {
    if (!allowanceData) return null;
    return formatUnits(
      BigInt(allowanceData.toString()),
      collateralAssetDecimals
    );
  }, [allowanceData, collateralAssetDecimals]);

  /// //// USE EFFECTS ///////
  // handle successful txn
  useEffect(() => {
    if (txnSuccessMsg && txnStep === 2) {
      renderToast(toast, txnSuccessMsg);
      refetchStates();
    }
  }, [txnSuccessMsg, txnStep]);

  useEffect(() => {
    const calculateDelta = () => {
      const newDepositAmountBigInt = parseUnits(
        depositAmount.toString(),
        collateralAssetDecimals
      );
      const currentDepositAmountBigInt = BigInt(
        positionData?.depositedCollateralAmount || 0
      );
      return newDepositAmountBigInt - currentDepositAmountBigInt;
    };

    setCollateralAmountDelta(calculateDelta());
  }, [depositAmount, positionData, collateralAssetDecimals]);

  useEffect(() => {
    if (isEdit && positionData) {
      const currentCollateral = Number(
        formatUnits(
          positionData.depositedCollateralAmount,
          collateralAssetDecimals
        )
      );
      setDepositAmount(currentCollateral);
    } else {
      setDepositAmount(0);
    }
  }, [nftId, positionData, isEdit, collateralAssetDecimals]);

  // handle successful approval
  useEffect(() => {
    if (isApproveSuccess && txnStep === 1) {
      handleCreateOrIncreaseLiquidity();
    }
  }, [isApproveSuccess, txnStep]);

  // handle successful add/increase liquidity
  useEffect(() => {
    if (addLiquiditySuccess) {
      setTxnSuccessMsg('successfully added liquidity');
    }
  }, [addLiquiditySuccess]);

  useEffect(() => {
    if (increaseLiquiditySuccess) {
      setTxnSuccessMsg('successfully increased liquidity');
    }
  }, [increaseLiquiditySuccess]);

  useEffect(() => {
    if (decreaseLiquiditySuccess) {
      setTxnSuccessMsg('successfully decreased liquidity');
    }
  }, [decreaseLiquiditySuccess]);

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
    if (isEdit) return;
    setLowPrice(tickToPrice(baseAssetMinPriceTick));
  }, [baseAssetMinPriceTick, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    setHighPrice(tickToPrice(baseAssetMaxPriceTick));
  }, [baseAssetMaxPriceTick, isEdit]);

  useEffect(() => {
    if (!uniswapPosition) return;
    const uniswapData = uniswapPosition as any[];
    const lowerTick = uniswapData[5];
    const upperTick = uniswapData[6];
    if (lowerTick) {
      setLowPrice(tickToPrice(lowerTick));
    }
    if (upperTick) {
      setHighPrice(tickToPrice(upperTick));
    }
  }, [uniswapPosition]);

  /// /// HANDLERS //////
  const handleCreateOrIncreaseLiquidity = () => {
    if (isEdit) {
      increaseLiquidity({
        address: foilData.address as `0x${string}`,
        abi: foilData.abi,
        functionName: 'increaseLiquidityPosition',
        args: [
          {
            positionId: nftId,
            collateralAmount: collateralAmountDelta, // total desired
            gasTokenAmount: baseTokenDelta, // generated with delta
            ethTokenAmount: quoteTokenDelta,
            minGasAmount: minAmountBaseTokenDelta,
            minEthAmount: minAmountQuoteTokenDelta,
          },
        ],
        chainId,
      });
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
        chainId,
      });
    }
    setTxnStep(2);
  };

  const refetchStates = () => {
    // reset form states
    setTxnSuccessMsg('');
    setDepositAmount(0);
    setLowPrice(tickToPrice(baseAssetMinPriceTick));
    setHighPrice(tickToPrice(baseAssetMaxPriceTick));
    setSlippage(0.5);
    setTxnStep(0);
    setPendingTxn(false);
    setIsLoading(false);

    // refetch contract data
    refetchCollateralAmount();
    refetchTokens();
    refetchPosition();
  };

  const resetAfterError = () => {
    setTxnStep(0);
    setPendingTxn(false);
    setIsLoading(false);
  };
  /**
   * Handle updating slippage tolerance
   * @param newSlippage - new slippage value
   */
  const handleSlippageChange = (newSlippage: number) => {
    setSlippage(newSlippage);
  };

  /**
   * handle decreasing liquidity position
   */
  const handleDecreaseLiquidty = () => {
    if (!liquidity) return;

    decreaseLiquidity({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'decreaseLiquidityPosition',
      args: [
        {
          positionId: nftId,
          liquidity: liquidity - newLiquidity,
          minGasAmount: parseUnits(minAmountTokenA.toString(), TOKEN_DECIMALS),
          minEthAmount: parseUnits(minAmountTokenB.toString(), TOKEN_DECIMALS),
        },
      ],
      chainId,
    });
    setTxnStep(2);
  };

  const handleFormSubmit = (e: any) => {
    setPendingTxn(true);
    setIsLoading(true);
    e.preventDefault();

    if (isEdit && isDecrease) {
      return handleDecreaseLiquidty();
    }

    // Double-check the delta before submission
    const newDepositAmountBigInt = parseUnits(
      depositAmount.toString(),
      collateralAssetDecimals
    );
    const currentDepositAmountBigInt = BigInt(
      positionData?.depositedCollateralAmount || 0
    );
    const calculatedDelta = newDepositAmountBigInt - currentDepositAmountBigInt;

    // Use the calculated delta if it differs from the state (shouldn't happen, but just in case)
    const finalDelta =
      calculatedDelta !== collateralAmountDelta
        ? calculatedDelta
        : collateralAmountDelta;

    if (finalDelta <= 0) {
      // No increase in deposit, proceed with creating or increasing liquidity
      handleCreateOrIncreaseLiquidity();
      return;
    }

    const collateralAmountDeltaFormatted = formatUnits(
      finalDelta,
      collateralAssetDecimals
    );

    if (
      allowance &&
      parseFloat(allowance) >= parseFloat(collateralAmountDeltaFormatted)
    ) {
      handleCreateOrIncreaseLiquidity();
    } else {
      approveWrite({
        abi: erc20ABI,
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [foilData.address, finalDelta],
        chainId,
      });
      setTxnStep(1);
    }
  };

  const handleDepositAmountChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = Number(e.target.value);
    setDepositAmount(value);
  };

  return (
    <form onSubmit={handleFormSubmit}>
      <Box mb={4}>
        <FormControl>
          <FormLabel>Collateral</FormLabel>
          <InputGroup>
            <Input
              type="number"
              value={depositAmount}
              onWheel={(e) => e.currentTarget.blur()}
              onChange={handleDepositAmountChange}
            />
            <InputRightAddon>{collateralAssetTicker}</InputRightAddon>
          </InputGroup>
        </FormControl>
      </Box>
      <FormControl mb={4}>
        <FormLabel>Low Price</FormLabel>
        <InputGroup>
          <Input
            type="number"
            disabled={isEdit}
            onWheel={(e) => e.currentTarget.blur()}
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
            onWheel={(e) => e.currentTarget.blur()}
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
          Base Token: {baseToken.toPrecision(3)} vGas (min:{' '}
          {minAmountTokenA.toPrecision(3)})
        </Text>
        <Text fontSize="sm" color="gray.500" mb="0.5">
          Quote Token: {quoteToken.toPrecision(3)} vGwei (min:{' '}
          {minAmountTokenB.toPrecision(3)})
        </Text>
        <Text display="none" fontSize="sm" color="gray.500" mb="0.5">
          Net Position: X Ggas
        </Text>
        {isConnected &&
        walletBalance !== null &&
        walletBalanceAfter !== null ? (
          <Text fontSize="sm" color="gray.500" mb="0.5">
            Wallet Balance: {Number(walletBalance).toFixed(2)}{' '}
            {collateralAssetTicker} → {walletBalanceAfter}{' '}
            {collateralAssetTicker}
          </Text>
        ) : null}
      </Box>
      {isConnected ? (
        <Button
          width="full"
          variant="brand"
          type="submit"
          isLoading={pendingTxn}
          isDisabled={pendingTxn}
        >
          {isEdit && isDecrease ? 'Decrease' : 'Add'} Liquidity
        </Button>
      ) : (
        <Button width="full" variant="brand" type="submit">
          Connect Wallet
        </Button>
      )}
    </form>
  );
};

export default AddEditLiquidity;
