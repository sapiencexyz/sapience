/* eslint-disable sonarjs/cognitive-complexity */

'use client';

// eslint-disable-next-line import/no-extraneous-dependencies
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { TickMath, SqrtPriceMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { decodeEventLog, formatUnits, parseUnits } from 'viem';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract,
  useChainId,
  useSwitchChain,
} from 'wagmi';

import erc20ABI from '../../../../erc20abi.json';
import INONFUNGIBLE_POSITION_MANAGER from '../../../../interfaces/Uniswap.NonfungiblePositionManager.json';
import { getNewLiquidity } from '../../../../util/positionUtil';
import { removeLeadingZeros } from '../../../../util/util';
import NumberDisplay from '../../numberDisplay';
import PositionSelector from '../../positionSelector';
import SlippageTolerance from '../../slippageTolerance';
import LiquidityPriceInput from '../LiquidityPriceInput';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '~/hooks/use-toast';
import {
  CREATE_LIQUIDITY_REDUCTION,
  TICK_SPACING_DEFAULT,
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

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
  const { nftId, refreshPositions, setNftId } = useAddEditPosition();
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
  const { toast } = useToast();
  const account = useAccount();
  const { isConnected } = account;

  const form = useForm({
    defaultValues: {
      depositAmount: '1',
      lowPrice: epochParams?.baseAssetMinPriceTick
        ? tickToPrice(epochParams.baseAssetMinPriceTick).toString()
        : '0',
      highPrice: epochParams?.baseAssetMaxPriceTick
        ? tickToPrice(epochParams.baseAssetMaxPriceTick).toString()
        : '0',
    },
    mode: 'onChange', // Validate on change instead of blur
    reValidateMode: 'onChange', // Keep revalidating on change
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isValid, touchedFields },
    setValue,
    reset: resetForm,
  } = form;
  const depositAmount = useWatch({
    control,
    name: 'depositAmount',
  });

  const lowPrice = useWatch({
    control,
    name: 'lowPrice',
  });

  const highPrice = useWatch({
    control,
    name: 'highPrice',
  });

  const [txnStep, setTxnStep] = useState<number>(0);
  const [slippage, setSlippage] = useState<number>(0.5);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [txnSuccessMsg, setTxnSuccessMsg] = useState('');

  const tickSpacing = pool ? pool?.tickSpacing : TICK_SPACING_DEFAULT;
  const tickLower = priceToTick(Number(lowPrice), tickSpacing);
  const tickUpper = priceToTick(Number(highPrice), tickSpacing);
  const isEdit = !!nftId;

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
    data: tokenAmounts,
    error: tokenAmountsError,
    isFetching,
  } = useReadContract({
    address: foilData.address,
    abi: foilData.abi,
    functionName: 'quoteLiquidityPositionTokens',
    args: [
      epoch.toString(),
      parseUnits(depositAmount.toString(), collateralAssetDecimals),
      pool ? pool.sqrtRatioX96.toString() : '0',
      tickLower > 0 ? TickMath.getSqrtRatioAtTick(tickLower).toString() : '0',
      tickUpper > 0 ? TickMath.getSqrtRatioAtTick(tickUpper).toString() : '0',
    ],
    chainId,
    query: {
      enabled: Boolean(pool && isValid && tickLower > 0 && tickUpper > 0),
    },
  });

  const { data: deltaTokenAmounts, error: deltaTokenAmountsError } =
    useReadContract({
      address: foilData.address,
      abi: foilData.abi,
      functionName: 'quoteLiquidityPositionTokens',
      args: [
        epoch.toString(),
        collateralAmountDelta,
        pool ? pool.sqrtRatioX96.toString() : '0',
        tickLower > 0 ? TickMath.getSqrtRatioAtTick(tickLower).toString() : '0',
        tickUpper > 0 ? TickMath.getSqrtRatioAtTick(tickUpper).toString() : '0',
      ],
      chainId,
      query: {
        enabled: Boolean(pool && isValid && tickLower > 0 && tickUpper > 0),
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
        toast({
          variant: 'destructive',
          title: 'Failed to approve',
          description: (error as Error).message,
        });
      },
    },
  });

  const { data: addLiquidityHash, writeContract: addLiquidityWrite } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          resetAfterError();
          toast({
            variant: 'destructive',
            title: 'Failed to add liquidity',
            description: (error as Error).message,
          });
        },
      },
    });

  const { data: increaseLiquidityHash, writeContract: increaseLiquidity } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          resetAfterError();
          toast({
            variant: 'destructive',
            title: 'Failed to increase liquidity',
            description: (error as Error).message,
          });
        },
      },
    });

  const { data: decreaseLiquidityHash, writeContract: decreaseLiquidity } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          resetAfterError();
          toast({
            variant: 'destructive',
            title: 'Failed to decrease liquidity',
            description: (error as Error).message,
          });
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
  const isDecrease = isEdit && Number(depositAmount) < positionCollateralAmount;

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

  const finalDelta: bigint = useMemo(() => {
    // Double-check the delta before submission
    const newDepositAmountBigInt = parseUnits(
      depositAmount !== '' ? depositAmount : '0',
      collateralAssetDecimals
    );

    const currentDepositAmountBigInt = BigInt(
      positionData?.depositedCollateralAmount || 0
    );
    const calculatedDelta = newDepositAmountBigInt - currentDepositAmountBigInt;

    // Use the calculated delta if it differs from the state (shouldn't happen, but just in case)
    return calculatedDelta !== collateralAmountDelta
      ? calculatedDelta
      : collateralAmountDelta;
  }, [
    depositAmount,
    positionData,
    collateralAssetDecimals,
    collateralAmountDelta,
  ]);

  const requireApproval: boolean = useMemo(() => {
    const collateralAmountDeltaFormatted = formatUnits(
      finalDelta,
      collateralAssetDecimals
    );
    return (
      !allowance ||
      parseFloat(allowance) < parseFloat(collateralAmountDeltaFormatted)
    );
  }, [allowance, finalDelta, collateralAssetDecimals]);

  /// //// USE EFFECTS ///////
  // handle successful txn
  useEffect(() => {
    if (txnSuccessMsg && txnStep === 2) {
      toast({
        title: txnSuccessMsg,
      });
      resetAfterSuccess();
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
      setValue('depositAmount', currentCollateral.toString(), {
        shouldValidate: false, // trigger any form validations
        shouldDirty: false, // mark the field as "dirty" (changed)
        shouldTouch: false,
      });
    } else {
      setValue('depositAmount', '0', {
        shouldValidate: false,
        shouldDirty: false, // don't mark as dirty since this is initial/reset value
        shouldTouch: false,
      });
    }
  }, [nftId, positionData, isEdit, collateralAssetDecimals, setValue]);

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
    }
  }, [decreaseLiquiditySuccess]);

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
            setTxnSuccessMsg(
              `Your liquidity position has been created as position ${nftId}`
            );
            setNftId(nftId);
            return;
          }
        } catch (error) {
          // This log was not for the LiquidityPositionCreated event, continue to next log
        }
      }
      setTxnSuccessMsg(`We've created your liquidity position for you.`);
    }
  }, [addLiquiditySuccess, addLiquidityReceipt]);

  useEffect(() => {
    // trader position so switch to trader tab
    console.log('positionData', positionData);
    if (positionData && positionData.kind === 2) {
      toast({
        title:
          'Your liquidity position has been closed and converted to a trader position with your accumulated position',
        duration: 5000,
      });
      router.push(
        `/trade/${chainId}%3A${marketAddress}/epochs/${epoch}?nftId=${nftId}`
      );
    }
  }, [positionData, toast]);

  // handle token amounts error
  useEffect(() => {
    toast({
      title: 'Failed to fetch token amounts',
      description: tokenAmountsError?.message,
      duration: 5000,
    });
  }, [tokenAmountsError, toast]);

  // hanlde uniswap error
  useEffect(() => {
    toast({
      title: 'Failed to get position from uniswap',
      description: uniswapPositionError?.message,
      duration: 5000,
    });
  }, [uniswapPositionError, toast]);

  useEffect(() => {
    if (isEdit) return;
    console.log('updating prices: ', epochParams);
    setValue(
      'lowPrice',
      tickToPrice(epochParams.baseAssetMinPriceTick).toString()
    );
    setValue(
      'highPrice',
      tickToPrice(epochParams.baseAssetMaxPriceTick).toString()
    );
  }, [epochParams, isEdit, setValue]);

  useEffect(() => {
    if (!uniswapPosition) return;
    const uniswapData = uniswapPosition as any[];
    const lowerTick = uniswapData[5];
    const upperTick = uniswapData[6];
    if (lowerTick) {
      setValue('lowPrice', tickToPrice(lowerTick).toString(), {
        shouldValidate: false,
        shouldDirty: false,
        shouldTouch: false,
      });
    }
    if (upperTick) {
      setValue('highPrice', tickToPrice(upperTick).toString(), {
        shouldValidate: false,
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [uniswapPosition, setValue]);

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

  const resetAfterError = () => {
    setTxnStep(0);
    setPendingTxn(false);
  };

  const resetAfterSuccess = () => {
    resetForm();
    setSlippage(0.5);

    setTxnSuccessMsg('');
    setTxnStep(0);
    setPendingTxn(false);

    refreshPositions();
    refetchPosition();
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

    if (isEdit && isDecrease) {
      return handleDecreaseLiquidity();
    }

    if (finalDelta <= 0) {
      // No increase in deposit, proceed with creating or increasing liquidity
      handleCreateOrIncreaseLiquidity();
      return;
    }

    if (requireApproval) {
      approveWrite({
        abi: erc20ABI,
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [foilData.address, finalDelta],
        chainId,
      });
      setTxnStep(1);
    } else {
      handleCreateOrIncreaseLiquidity();
    }
  };

  const getButtonText = () => {
    let txt = '';
    if (isEdit) {
      if (depositAmount === '' || parseFloat(depositAmount) === 0) {
        txt = 'Close Liquidity Position';
      } else {
        txt = isDecrease ? 'Decrease Liquidity' : 'Increase Liquidity';
      }
    } else {
      txt = 'Add Liquidity';
    }

    if (requireApproval) {
      txt = `Approve ${collateralAssetTicker} Transfer`;
    }

    return txt;
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button className="w-full" size="lg" onClick={openConnectModal}>
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== chainId) {
      return (
        <Button
          className="w-full"
          size="lg"
          onClick={() => switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }

    const isAmountUnchanged =
      isEdit && depositAmount === positionCollateralAmount.toString();
    const isBlankDeposit = depositAmount === '' || !Number(depositAmount);

    const isDisabled =
      pendingTxn ||
      isFetching ||
      (!isEdit && isBlankDeposit) ||
      (isEdit && isAmountUnchanged) ||
      !isValid;

    return (
      <Button className="w-full" size="lg" type="submit" disabled={isDisabled}>
        {getButtonText()}
      </Button>
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <h2 className="text-xl font-semibold mb-3">Pool Liquidity</h2>

        <div className="mb-4">
          <div>
            <div className={errors.depositAmount ? 'space-y-1' : ''}>
              <Label htmlFor="collateral">Collateral</Label>
              <div className="relative flex">
                <Input
                  id="collateral"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={depositAmount}
                  className="pr-20"
                  onWheel={(e) => e.currentTarget.blur()}
                  {...register('depositAmount', {
                    onChange: (e) => {
                      const processed = removeLeadingZeros(e.target.value);
                      setValue('depositAmount', processed, {
                        shouldValidate: true,
                      });
                    },
                    onBlur: () => {
                      if (depositAmount === '') {
                        setValue('depositAmount', '0', {
                          shouldValidate: false,
                          shouldDirty: false,
                          shouldTouch: false,
                        });
                      }
                    },
                    validate: (value) => {
                      if (value === '' || parseFloat(value) === 0) {
                        if (isEdit) {
                          return true;
                        }
                        return 'Amount is required';
                      }
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
                <div className="absolute inset-y-0 right-0 flex items-center px-3 border border-l-0 border-input bg-muted">
                  {collateralAssetTicker}
                </div>
              </div>
              {errors.depositAmount && (
                <p className="text-sm text-destructive">
                  {errors.depositAmount.message?.toString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <LiquidityPriceInput
          label="Low Price"
          name="lowPrice"
          control={control}
          isDisabled={isEdit}
          minAllowedPrice={tickToPrice(epochParams.baseAssetMinPriceTick)}
          maxAllowedPrice={Number(highPrice)}
        />

        <LiquidityPriceInput
          label="High Price"
          name="highPrice"
          control={control}
          isDisabled={isEdit}
          minAllowedPrice={Number(lowPrice)}
          maxAllowedPrice={tickToPrice(epochParams.baseAssetMaxPriceTick)}
        />

        <SlippageTolerance />

        {renderActionButton()}

        <div className="flex flex-col gap-2 mt-4">
          <PositionSelector isLP />

          <div>
            <p className="text-sm text-gray-600 font-semibold mb-0.5">
              Base Token
            </p>
            <p className="text-sm text-gray-600 mb-0.5">
              <NumberDisplay value={baseToken} /> vGGas (Min.{' '}
              <NumberDisplay value={minAmountTokenA} />)
            </p>
          </div>

          <div>
            <p className="text-sm text-gray-600 font-semibold mb-0.5">
              Quote Token
            </p>
            <p className="text-sm text-gray-600 mb-0.5">
              <NumberDisplay value={quoteToken} /> vWstETH (Min.{' '}
              <NumberDisplay value={minAmountTokenB} />)
            </p>
          </div>

          {isEdit && (
            <div>
              <p className="text-sm text-gray-600 font-semibold mb-0.5">
                Position Collateral
              </p>
              <p className="text-sm text-gray-600 mb-0.5">
                <NumberDisplay value={positionCollateralAmount} />{' '}
                {collateralAssetTicker}
                {positionCollateralAmount !== positionCollateralAfter && (
                  <>
                    {' '}
                    → <NumberDisplay value={positionCollateralAfter} />{' '}
                    {collateralAssetTicker}
                  </>
                )}
              </p>
            </div>
          )}

          {isConnected &&
            walletBalance !== null &&
            walletBalanceAfter !== null &&
            walletBalance !== walletBalanceAfter && (
              <div>
                <p className="text-sm text-gray-600 font-semibold mb-0.5">
                  Wallet Balance
                </p>
                <p className="text-sm text-gray-600 mb-0.5">
                  <NumberDisplay value={walletBalance} />{' '}
                  {collateralAssetTicker} →{' '}
                  <NumberDisplay value={walletBalanceAfter} />{' '}
                  {collateralAssetTicker}
                </p>
              </div>
            )}
        </div>
      </form>
    </Form>
  );
};

export default AddEditLiquidity;
