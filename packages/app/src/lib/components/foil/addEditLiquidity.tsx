'use client';

// eslint-disable-next-line import/no-extraneous-dependencies
import {
  Box,
  FormControl,
  Text,
  FormLabel,
  Input,
  InputGroup,
  InputRightAddon,
  Button,
  Flex,
  useToast,
  FormErrorMessage,
} from '@chakra-ui/react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { TickMath, SqrtPriceMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { WriteContractErrorType } from 'viem';
import { decodeEventLog, formatUnits, parseUnits } from 'viem';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useChainId,
  useSwitchChain,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import INONFUNGIBLE_POSITION_MANAGER from '../../interfaces/Uniswap.NonfungiblePositionManager.json';
import { getNewLiquidity } from '../../util/positionUtil';
import { renderContractErrorToast, renderToast } from '../../util/util';
import {
  CREATE_LIQUIDITY_REDUCTION,
  TICK_SPACING_DEFAULT,
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

import LiquidityPriceInput from './LiquidityPriceInput';
import NumberDisplay from './numberDisplay';
import SlippageTolerance from './slippageTolerance';

// TODO 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()
// Also move this a to helper?
const tickToPrice = (tick: number): number => 1.0001 ** tick;
const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

function getTokenAmountsFromLiquidity(
  tickLower: number,
  tickUpper: number,
  liquidity: JSBI
): { amount0: JSBI; amount1: JSBI } {
  const sqrtRatioA = TickMath.getSqrtRatioAtTick(tickLower);
  const sqrtRatioB = TickMath.getSqrtRatioAtTick(tickUpper);

  const amount0 = SqrtPriceMath.getAmount0Delta(
    sqrtRatioA,
    sqrtRatioB,
    liquidity,
    true
  );
  const amount1 = SqrtPriceMath.getAmount1Delta(
    sqrtRatioA,
    sqrtRatioB,
    liquidity,
    true
  );

  return { amount0, amount1 };
}

const AddEditLiquidity: React.FC = () => {
  const { nftId, refreshPositions } = useAddEditPosition();
  console.log('nftId', nftId);

  const {
    epoch,
    pool,
    collateralAsset,
    epochParams,
    collateralAssetTicker,
    collateralAssetDecimals,
    chainId,
    foilData,
    refetchUniswapData,
    address: marketAddress,
  } = useContext(MarketContext);
  const { setIsLoading } = useLoading();
  const toast = useToast();
  const account = useAccount();
  const { isConnected } = account;

  const [depositAmount, setDepositAmount] = useState<string>('0');
  const [lowPrice, setLowPrice] = useState(
    tickToPrice(epochParams.baseAssetMinPriceTick)
  );
  const [highPrice, setHighPrice] = useState(
    tickToPrice(epochParams.baseAssetMaxPriceTick)
  );
  const [txnStep, setTxnStep] = useState<number>(0);
  const [slippage, setSlippage] = useState<number>(0.5);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [txnSuccessMsg, setTxnSuccessMsg] = useState('');

  const tickSpacing = pool ? pool?.tickSpacing : TICK_SPACING_DEFAULT;
  const tickLower = priceToTick(lowPrice, tickSpacing);
  const tickUpper = priceToTick(highPrice, tickSpacing);
  const isEdit = nftId > 0;

  const [collateralAmountDelta, setCollateralAmountDelta] = useState<bigint>(
    BigInt(0)
  );

  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const router = useRouter();

  /// //// READ CONTRACT HOOKS ///////
  const { data: positionData, refetch: refetchPosition } = useReadContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
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
      address: epochParams.uniswapPositionManager,
      functionName: 'positions',
      args: [positionData?.uniswapPositionId || BigInt('0')],
      query: {
        enabled: Boolean(
          epochParams.uniswapPositionManager !== '0x' &&
            positionData?.uniswapPositionId &&
            isEdit
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
    args: [account.address, marketAddress],
    query: {
      enabled: Boolean(isConnected && marketAddress),
    },
    chainId,
  });

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting, isValid },
    setError,
    clearErrors,
    trigger,
  } = useForm();

  const {
    data: tokenAmounts,
    error: tokenAmountsError,
    isFetching,
  } = useReadContract({
    address: foilData.address,
    abi: foilData.abi,
    functionName: 'getTokenAmounts',
    args: [
      epoch.toString(),
      parseUnits(depositAmount.toString(), collateralAssetDecimals),
      pool ? pool.sqrtRatioX96.toString() : '0',
      tickLower > 0 ? TickMath.getSqrtRatioAtTick(tickLower).toString() : '0',
      tickUpper > 0 ? TickMath.getSqrtRatioAtTick(tickUpper).toString() : '0',
    ],
    chainId,
    query: {
      enabled: Boolean(pool && isValid),
    },
  });

  const { data: deltaTokenAmounts, error: deltaTokenAmountsError } =
    useReadContract({
      address: foilData.address,
      abi: foilData.abi,
      functionName: 'getTokenAmounts',
      args: [
        epoch.toString(),
        collateralAmountDelta,
        pool ? pool.sqrtRatioX96.toString() : '0',
        tickLower > 0 ? TickMath.getSqrtRatioAtTick(tickLower).toString() : '0',
        tickUpper > 0 ? TickMath.getSqrtRatioAtTick(tickUpper).toString() : '0',
      ],
      chainId,
      query: {
        enabled: Boolean(pool && isValid),
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

  const { data: decreaseLiquidityHash, writeContract: decreaseLiquidity } =
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

  const { isSuccess: addLiquiditySuccess, data: addLiquidityReceipt } =
    useWaitForTransactionReceipt({
      hash: addLiquidityHash,
    });

  const { isSuccess: increaseLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: increaseLiquidityHash,
  });
  const { isSuccess: decreaseLiquiditySuccess } = useWaitForTransactionReceipt({
    hash: decreaseLiquidityHash,
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
  const isDecrease =
    isEdit && depositAmount < positionCollateralAmount.toString();

  const newLiquidity: bigint = useMemo(() => {
    if (!liquidity) return BigInt(0);
    return getNewLiquidity(
      depositAmount !== '' ? parseFloat(depositAmount) : 0,
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

  // same as token0/tokenA/gasToken
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

  const positionCollateralAfter = useMemo(() => {
    if (!isEdit) return parseFloat(depositAmount || '0');
    return parseFloat(depositAmount || '0');
  }, [isEdit, depositAmount, positionCollateralAmount]);

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
        depositAmount !== '' ? depositAmount : '0',
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
      setDepositAmount(currentCollateral.toString());
    } else {
      setDepositAmount('0');
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
    if (increaseLiquiditySuccess) {
      setTxnSuccessMsg('Successfully increased liquidity');
    }
  }, [increaseLiquiditySuccess]);

  useEffect(() => {
    if (decreaseLiquiditySuccess) {
      setTxnSuccessMsg('Successfully decreased liquidity');
      // call getPositionData
      refetchPosition();
    }
  }, [decreaseLiquiditySuccess, depositAmount, toast, refetchPosition]);

  useEffect(() => {
    // trader position so switch to trader tab
    if (positionData && positionData.kind === 2) {
      toast({
        title:
          'Your liquidity position has been closed and converted to a trader position with your accumulated position',
        status: 'info',
        duration: 5000,
        isClosable: true,
      });
      router.push(
        `/trade/${chainId}%3A${marketAddress}/epochs/${epoch}?nftId=${nftId}`
      );
    }
  }, [positionData, toast]);

  // handle token amounts error
  useEffect(() => {
    renderContractErrorToast(
      tokenAmountsError,
      toast,
      'Failed to fetch token amounts'
    );
  }, [tokenAmountsError, toast]);

  // hanlde uniswap error
  useEffect(() => {
    renderContractErrorToast(
      uniswapPositionError,
      toast,
      'Failed to get position from uniswap'
    );
  }, [uniswapPositionError, toast]);

  useEffect(() => {
    if (isEdit) return;
    setLowPrice(tickToPrice(epochParams.baseAssetMinPriceTick));
  }, [epochParams.baseAssetMinPriceTick, isEdit]);

  useEffect(() => {
    if (isEdit) return;
    setHighPrice(tickToPrice(epochParams.baseAssetMaxPriceTick));
  }, [epochParams.baseAssetMaxPriceTick, isEdit]);

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

  useEffect(() => {
    if (isEdit) return;
    const minAllowedPrice = tickToPrice(epochParams.baseAssetMinPriceTick);
    const maxAllowedPrice = tickToPrice(epochParams.baseAssetMaxPriceTick);

    if (lowPrice < minAllowedPrice) {
      setError('lowPrice', {
        type: 'manual',
        message: `Low price cannot be less than ${minAllowedPrice.toFixed(
          2
        )} Ggas/wstETH`,
      });
    } else {
      clearErrors('lowPrice');
    }

    if (highPrice > maxAllowedPrice) {
      setError('highPrice', {
        type: 'manual',
        message: `High price cannot exceed ${maxAllowedPrice.toFixed(
          2
        )} Ggas/wstETH`,
      });
    } else {
      clearErrors('highPrice');
    }
  }, [
    lowPrice,
    highPrice,
    epochParams.baseAssetMinPriceTick,
    epochParams.baseAssetMaxPriceTick,
    isEdit,
    setError,
    clearErrors,
  ]);

  useEffect(() => {
    const validateCollateral = async () => {
      if (walletBalance && depositAmount !== '') {
        const currentDepositAmount = isEdit ? positionCollateralAmount : 0;
        const increaseAmount = parseFloat(depositAmount) - currentDepositAmount;

        if (increaseAmount > 0 && increaseAmount > parseFloat(walletBalance)) {
          setError('collateral', {
            type: 'manual',
            message: 'Insufficient balance in wallet',
          });
        } else {
          clearErrors('collateral');
        }
      } else {
        clearErrors('collateral');
      }
      await trigger('collateral');
    };

    validateCollateral();
  }, [
    depositAmount,
    walletBalance,
    isEdit,
    positionCollateralAmount,
    setError,
    clearErrors,
    trigger,
  ]);

  useEffect(() => {
    if (addLiquiditySuccess && addLiquidityReceipt) {
      for (const log of addLiquidityReceipt.logs) {
        try {
          const event = decodeEventLog({
            abi: foilData.abi,
            data: log.data,
            topics: log.topics,
          });

          if ((event as any).eventName === 'LiquidityPositionCreated') {
            const nftId = (event as any).args.positionId.toString();
            router.push(
              `/markets/${chainId}:${marketAddress}/positions/${nftId}`
            );
            renderToast(
              toast,
              `Your liquidity position has been created as position ${nftId}`
            );
            resetAfterSuccess();
            return;
          }
        } catch (error) {
          // This log was not for the LiquidityPositionCreated event, continue to next log
        }
      }
      renderToast(toast, `We've created your liquidity position for you.`);
      resetAfterSuccess();
    }
  }, [addLiquiditySuccess, addLiquidityReceipt]);

  /// /// HANDLERS //////
  const getCurrentDeadline = (): bigint => {
    return BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 minutes from now
  };

  const adjustedBaseToken = baseToken * (1 - CREATE_LIQUIDITY_REDUCTION);
  const adjustedQuoteToken = quoteToken * (1 - CREATE_LIQUIDITY_REDUCTION);

  const handleCreateOrIncreaseLiquidity = () => {
    const deadline = getCurrentDeadline();
    if (isEdit) {
      increaseLiquidity({
        address: foilData.address as `0x${string}`,
        abi: foilData.abi,
        functionName: 'increaseLiquidityPosition',
        args: [
          {
            positionId: nftId,
            collateralAmount: collateralAmountDelta,
            gasTokenAmount: baseTokenDelta,
            ethTokenAmount: quoteTokenDelta,
            minGasAmount: minAmountBaseTokenDelta,
            minEthAmount: minAmountQuoteTokenDelta,
            deadline,
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
            amountTokenA: parseUnits(
              adjustedBaseToken.toString(),
              TOKEN_DECIMALS
            ),
            amountTokenB: parseUnits(
              adjustedQuoteToken.toString(),
              TOKEN_DECIMALS
            ),
            collateralAmount: parseUnits(
              depositAmount !== '' ? depositAmount : '0',
              collateralAssetDecimals
            ),
            lowerTick: tickLower,
            upperTick: tickUpper,
            minAmountTokenA: parseUnits(
              minAmountTokenA.toString(),
              TOKEN_DECIMALS
            ),
            minAmountTokenB: parseUnits(
              minAmountTokenB.toString(),
              TOKEN_DECIMALS
            ),
            deadline,
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
    setTxnStep(0);
    setPendingTxn(false);
    setIsLoading(false);

    // refetch contract data
    refetchCollateralAmount();
    refreshPositions();
    refetchPosition();
    refetchUniswapData();
  };

  const resetAfterError = () => {
    setTxnStep(0);
    setPendingTxn(false);
    setIsLoading(false);
  };

  const resetAfterSuccess = () => {
    setDepositAmount('0');
    setSlippage(0.5);
    setPendingTxn(false);
    setIsLoading(false);
    refreshPositions();
    refetchUniswapData();
    refetchCollateralAmount();
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
  const handleDecreaseLiquidity = () => {
    console.log('decreasing liquidity');
    if (!liquidity) {
      console.log('noliquidity found');
      resetAfterError();
      return;
    }

    // Convert liquidity and newLiquidity to JSBI
    const liquidityJSBI = JSBI.BigInt(liquidity.toString());
    const newLiquidityJSBI = JSBI.BigInt(newLiquidity.toString());

    // Calculate the liquidity to remove
    const liquidityToRemove = JSBI.subtract(liquidityJSBI, newLiquidityJSBI);

    // Get amounts for total liquidity, not just the new liquidity
    const { amount0, amount1 } = getTokenAmountsFromLiquidity(
      tickLower,
      tickUpper,
      liquidityJSBI
    );

    // Calculate the proportion of liquidity being removed
    const proportion = JSBI.divide(liquidityToRemove, liquidityJSBI);

    // Calculate the amounts being removed
    const amount0ToRemove = JSBI.divide(
      JSBI.multiply(amount0, proportion),
      JSBI.BigInt(1e18)
    );
    const amount1ToRemove = JSBI.divide(
      JSBI.multiply(amount1, proportion),
      JSBI.BigInt(1e18)
    );

    // Convert amounts to decimal strings
    const amount0Decimal =
      parseFloat(amount0ToRemove.toString()) / 10 ** TOKEN_DECIMALS;
    const amount1Decimal =
      parseFloat(amount1ToRemove.toString()) / 10 ** TOKEN_DECIMALS;

    // Calculate minimum amounts with slippage
    const minAmount0 = amount0Decimal * (1 - slippage / 100);
    const minAmount1 = amount1Decimal * (1 - slippage / 100);

    // Parse amounts with proper decimals
    const parsedMinAmount0 = parseUnits(
      minAmount0.toFixed(TOKEN_DECIMALS),
      TOKEN_DECIMALS
    );
    const parsedMinAmount1 = parseUnits(
      minAmount1.toFixed(TOKEN_DECIMALS),
      TOKEN_DECIMALS
    );

    console.log('Decrease Liquidity Parameters:', {
      positionId: nftId,
      liquidity: liquidityToRemove.toString(),
      minGasAmount: parsedMinAmount0.toString(),
      minEthAmount: parsedMinAmount1.toString(),
    });

    const deadline = getCurrentDeadline();
    decreaseLiquidity({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'decreaseLiquidityPosition',
      args: [
        {
          positionId: nftId,
          liquidity: liquidityToRemove.toString(),
          minGasAmount: parsedMinAmount0,
          minEthAmount: parsedMinAmount1,
          deadline,
        },
      ],
      chainId,
    });
    setTxnStep(2);
  };

  const handleFormSubmit = (e: any) => {
    setPendingTxn(true);
    setIsLoading(true);

    if (isEdit && isDecrease) {
      return handleDecreaseLiquidity();
    }

    // Double-check the delta before submission
    const newDepositAmountBigInt = parseUnits(
      depositAmount !== '' ? depositAmount : '0',
      collateralAssetDecimals
    );
    const currentDepositAmountBigInt = BigInt(
      positionData?.depositedCollateralAmount || 0
    );
    const calculatedDelta = newDepositAmountBigInt - currentDepositAmountBigInt;
    console.log('newDepositAmountBigInt', newDepositAmountBigInt);
    console.log('currentDepositAmountBigInt', currentDepositAmountBigInt);
    console.log('calculatedDelta', calculatedDelta);
    console.log('collateralAmountDelta', collateralAmountDelta);

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
    let { value } = e.target;

    // Remove leading zeros, but keep a single zero if it's the only digit
    if (value !== '0') {
      value = value.replace(/^0+/, '');
    }

    // Ensure the value is valid
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setDepositAmount(value);
    }
  };

  const getButtonText = () => {
    if (isEdit) {
      if (depositAmount === '' || parseFloat(depositAmount) === 0) {
        return 'Close Liquidity Position';
      }
      return isDecrease ? 'Decrease Liquidity' : 'Increase Liquidity';
    }
    return 'Add Liquidity';
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button
          width="full"
          size="lg"
          variant="brand"
          onClick={openConnectModal}
        >
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== chainId) {
      return (
        <Button
          width="full"
          variant="brand"
          size="lg"
          onClick={() => switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }

    const isAmountUnchanged =
      isEdit && depositAmount === positionCollateralAmount.toString();
    const isBlankDeposit = depositAmount === '';

    const isDisabled =
      pendingTxn ||
      isFetching ||
      isBlankDeposit ||
      (isEdit && isAmountUnchanged) ||
      !isValid;

    return (
      <Button
        width="full"
        variant="brand"
        size="lg"
        type="submit"
        isLoading={pendingTxn || isFetching}
        isDisabled={isDisabled}
      >
        {getButtonText()}
      </Button>
    );
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)}>
      <Box mb={4}>
        <FormControl isInvalid={!!errors.collateral}>
          <FormLabel htmlFor="collateral">Collateral</FormLabel>
          <InputGroup>
            <Input
              id="collateral"
              type="number"
              min={0}
              step="any"
              value={depositAmount}
              onWheel={(e) => e.currentTarget.blur()}
              {...register('collateral', {
                onChange: handleDepositAmountChange,
                validate: (value) => {
                  if (value === '') return true;
                  const currentDepositAmount = isEdit
                    ? positionCollateralAmount
                    : 0;
                  const increaseAmount =
                    parseFloat(value) - currentDepositAmount;
                  return (
                    increaseAmount <= 0 ||
                    (walletBalance &&
                      increaseAmount <= parseFloat(walletBalance)) ||
                    'Insufficient balance in wallet'
                  );
                },
              })}
            />
            <InputRightAddon>{collateralAssetTicker}</InputRightAddon>
          </InputGroup>
          <FormErrorMessage>
            {errors.collateral && errors.collateral.message?.toString()}
          </FormErrorMessage>
        </FormControl>
      </Box>
      <LiquidityPriceInput
        label="Low Price"
        value={lowPrice}
        onChange={(value) => setLowPrice(value)}
        isDisabled={isEdit}
        minAllowedPrice={tickToPrice(epochParams.baseAssetMinPriceTick)}
        maxAllowedPrice={highPrice}
        error={errors.lowPrice?.message?.toString()}
      />
      <LiquidityPriceInput
        label="High Price"
        value={highPrice}
        onChange={(value) => setHighPrice(value)}
        isDisabled={isEdit}
        minAllowedPrice={lowPrice}
        maxAllowedPrice={tickToPrice(epochParams.baseAssetMaxPriceTick)}
        error={errors.highPrice?.message?.toString()}
      />

      <SlippageTolerance onSlippageChange={handleSlippageChange} />

      {renderActionButton()}

      <Flex gap={2} flexDir="column" mt={4}>
        <Box>
          <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
            Base Token
          </Text>
          <Text fontSize="sm" color="gray.600" mb={0.5}>
            <NumberDisplay value={baseToken} /> vGGas (Min.{' '}
            <NumberDisplay value={minAmountTokenA} />)
          </Text>
        </Box>

        <Box>
          <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
            Quote Token
          </Text>
          <Text fontSize="sm" color="gray.600" mb={0.5}>
            <NumberDisplay value={quoteToken} /> vWstETH (Min.{' '}
            <NumberDisplay value={minAmountTokenB} />)
          </Text>
        </Box>

        {isEdit && (
          <Box>
            <Text fontSize="sm" color="gray.600" fontWeight="semibold" mb={0.5}>
              Position Collateral
            </Text>
            <Text fontSize="sm" color="gray.600" mb={0.5}>
              <NumberDisplay value={positionCollateralAmount} />{' '}
              {collateralAssetTicker}
              {positionCollateralAmount !== positionCollateralAfter && (
                <>
                  {' '}
                  → <NumberDisplay value={positionCollateralAfter} />{' '}
                  {collateralAssetTicker}
                </>
              )}
            </Text>
          </Box>
        )}

        {isConnected &&
          walletBalance !== null &&
          walletBalanceAfter !== null &&
          walletBalance !== walletBalanceAfter && (
            <Box>
              <Text
                fontSize="sm"
                color="gray.600"
                fontWeight="semibold"
                mb={0.5}
              >
                Wallet Balance
              </Text>
              <Text fontSize="sm" color="gray.600" mb={0.5}>
                <NumberDisplay value={walletBalance} /> {collateralAssetTicker}{' '}
                → <NumberDisplay value={walletBalanceAfter} />{' '}
                {collateralAssetTicker}
              </Text>
            </Box>
          )}
      </Flex>
    </form>
  );
};

export default AddEditLiquidity;
