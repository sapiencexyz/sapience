/* eslint-disable sonarjs/cognitive-complexity */

'use client';

// eslint-disable-next-line import/no-extraneous-dependencies
import { TickMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import { Loader2 } from 'lucide-react';
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

import { useConnectWallet } from '../../lib/context/ConnectWalletProvider';
import { useFoil } from '../../lib/context/FoilProvider';
import erc20ABI from '../../lib/erc20abi.json';
import INONFUNGIBLE_POSITION_MANAGER from '../../lib/interfaces/Uniswap.NonfungiblePositionManager.json';
import NumberDisplay from '../numberDisplay';
import PositionSelector from '../positionSelector';
import SlippageTolerance from '../slippageTolerance';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useToast } from '~/hooks/use-toast';
import {
  CREATE_LIQUIDITY_REDUCTION,
  TICK_SPACING_DEFAULT,
  TOKEN_DECIMALS,
} from '~/lib/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { useTradePool } from '~/lib/context/TradePoolContext';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { JSBIAbs, convertGgasPerWstEthToGwei } from '~/lib/utils/util';

import LiquidityAmountInput from './LiquidityAmountInput';
import LiquidityPriceInput from './LiquidityPriceInput';

// TODO 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()
// Also move this a to helper?
const tickToPrice = (tick: number): number => 1.0001 ** tick;
const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

const LiquidityForm: React.FC = () => {
  const { nftId, refreshPositions, setNftId } = useAddEditPosition();
  const {
    epoch,
    pool,
    collateralAsset,
    collateralAssetTicker,
    collateralAssetDecimals,
    chainId,
    foilData,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    refetchUniswapData,
    address: marketAddress,
    marketParams,
    useMarketUnits,
  } = useContext(PeriodContext);

  const { stEthPerToken } = useFoil();

  if (!epoch) {
    throw new Error('Epoch is not defined');
  }

  const { toast } = useToast();
  const account = useAccount();
  const { isConnected } = account;

  const {
    setLowPriceTick,
    setHighPriceTick,
    lowPriceTick: contextLowPriceTick,
    highPriceTick: contextHighPriceTick,
    snapPriceToTick,
  } = useTradePool();

  const tickSpacing = pool ? pool?.tickSpacing : TICK_SPACING_DEFAULT;
  const isEdit = !!nftId;

  const form = useForm({
    defaultValues: {
      depositAmount: '0',
      modifyLiquidity: '0',
      lowPrice: baseAssetMinPriceTick
        ? tickToPrice(baseAssetMinPriceTick).toString()
        : '0',
      highPrice: baseAssetMaxPriceTick
        ? tickToPrice(baseAssetMaxPriceTick).toString()
        : '0',
      slippage: '0.5',
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
    resolver: (values) => {
      const errors: Record<string, { type: string; message: string }> = {};

      const lowPriceNum = Number(values.lowPrice);
      const minPrice = useMarketUnits
        ? tickToPrice(baseAssetMinPriceTick)
        : convertGgasPerWstEthToGwei(
            tickToPrice(baseAssetMinPriceTick),
            stEthPerToken
          );
      const maxLowPrice = Number(values.highPrice);
      const lowPriceTick = priceToTick(
        useMarketUnits
          ? lowPriceNum
          : lowPriceNum / convertGgasPerWstEthToGwei(1, stEthPerToken),
        tickSpacing
      );

      if (lowPriceNum < minPrice) {
        errors.lowPrice = {
          type: 'minPrice',
          message: `Low price must be at least ${minPrice}`,
        };
      } else if (lowPriceNum >= maxLowPrice) {
        errors.lowPrice = {
          type: 'maxPrice',
          message: `Low price must be less than ${maxLowPrice}`,
        };
      } else if (lowPriceTick % tickSpacing !== 0) {
        errors.lowPrice = {
          type: 'tickSpacing',
          message: `Low price must align with tick spacing of ${tickSpacing}`,
        };
      }

      const highPriceNum = Number(values.highPrice);
      const minHighPrice = Number(values.lowPrice);
      const maxPrice = useMarketUnits
        ? tickToPrice(baseAssetMaxPriceTick)
        : convertGgasPerWstEthToGwei(
            tickToPrice(baseAssetMaxPriceTick),
            stEthPerToken
          );
      const highPriceTick = priceToTick(
        useMarketUnits
          ? highPriceNum
          : highPriceNum / convertGgasPerWstEthToGwei(1, stEthPerToken),
        tickSpacing
      );

      if (highPriceNum <= minHighPrice) {
        errors.highPrice = {
          type: 'minPrice',
          message: `Max price must be greater than ${minHighPrice}`,
        };
      } else if (highPriceNum > maxPrice) {
        errors.highPrice = {
          type: 'maxPrice',
          message: `Max price must be at most ${maxPrice}`,
        };
      } else if (highPriceTick % tickSpacing !== 0) {
        errors.highPrice = {
          type: 'tickSpacing',
          message: `Max price must align with tick spacing of ${tickSpacing}`,
        };
      }

      return {
        values,
        errors: Object.keys(errors).length > 0 ? errors : {},
      };
    },
  });

  const {
    control,
    handleSubmit,
    formState: { isValid },
    setValue,
    reset: resetForm,
  } = form;

  const modifyLiquidity = useWatch({
    control,
    name: 'modifyLiquidity',
  });

  const depositAmount = useWatch({
    control,
    name: 'depositAmount',
  });

  const slippageStr = useWatch({
    control,
    name: 'slippage',
  });
  const slippage = Number(slippageStr);

  const [txnStep, setTxnStep] = useState<number>(0);
  const [pendingTxn, setPendingTxn] = useState(false);
  const [txnSuccessMsg, setTxnSuccessMsg] = useState('');
  const [liquidityAction, setLiquidityAction] = useState<'add' | 'remove'>(
    'add'
  );

  const [collateralAmountDelta, setCollateralAmountDelta] = useState<bigint>(
    BigInt(0)
  );

  // Calculate ticks using useMemo after all variables are declared
  const { tickLower, tickUpper } = useMemo(() => {
    return {
      tickLower: contextLowPriceTick ?? baseAssetMinPriceTick,
      tickUpper: contextHighPriceTick ?? baseAssetMaxPriceTick,
    };
  }, [
    contextLowPriceTick,
    contextHighPriceTick,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
  ]);

  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { setIsOpen } = useConnectWallet();
  const router = useRouter();

  const isDecrease =
    liquidityAction === 'remove' && Number(modifyLiquidity) > 0;
  const isAmountUnchanged = isEdit
    ? Number(modifyLiquidity) === 0
    : Number(depositAmount) === 0;

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

  const {
    data: uniswapPosition,
    error: uniswapPositionError,
    refetch: refetchUniswapPosition,
  } = useReadContract({
    abi: INONFUNGIBLE_POSITION_MANAGER.abi,
    address: marketParams.uniswapPositionManager,
    functionName: 'positions',
    args: [positionData?.uniswapPositionId || BigInt('0')],
    query: {
      enabled: Boolean(
        marketParams.uniswapPositionManager !== '0x' &&
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

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
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
      onSuccess: () => {
        toast({
          title: 'Approval Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { data: addLiquidityHash, writeContract: addLiquidityWrite } =
    useWriteContract({
      mutation: {
        onError: (error) => {
          console.error('Failed to add liquidity', error);
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
          console.error('Failed to increase liquidity', error);
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
          console.error('Failed to decrease liquidity', error);
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

  const newLiquidity = useMemo(() => {
    if (!liquidity) return BigInt(0);

    // Handle empty or invalid input
    const inputValue = modifyLiquidity === '' ? '0' : modifyLiquidity;
    const percentage = parseFloat(inputValue) / 100;

    // Return original liquidity if percentage is invalid
    if (isNaN(percentage)) return BigInt(liquidity.toString());

    if (liquidityAction === 'add') {
      // For add, increase by the percentage (100% = double)
      const multiplier = 1 + percentage;
      const jsbiNewLiq = JSBI.multiply(
        JSBI.BigInt(liquidity.toString()),
        JSBI.BigInt(Math.floor(multiplier * 100))
      );
      return BigInt(JSBI.divide(jsbiNewLiq, JSBI.BigInt(100)).toString());
    }
    // For remove, decrease by the percentage (100% = zero)
    const multiplier = 1 - percentage;
    const jsbiNewLiq = JSBI.multiply(
      JSBI.BigInt(liquidity.toString()),
      JSBI.BigInt(Math.floor(multiplier * 100))
    );
    return BigInt(JSBI.divide(jsbiNewLiq, JSBI.BigInt(100)).toString());
  }, [modifyLiquidity, liquidity, liquidityAction]);

  const deltaLiquidity = JSBIAbs(
    JSBI.subtract(
      JSBI.BigInt(liquidity?.toString() || '0'),
      JSBI.BigInt(newLiquidity.toString())
    )
  );

  const { data: deltaTokenAmounts } = useReadContract({
    address: foilData.address,
    abi: foilData.abi,
    functionName: 'getTokensFromLiquidity',
    args: [
      deltaLiquidity.toString(),
      pool ? pool.sqrtRatioX96.toString() : '0',
      tickLower > 0 ? TickMath.getSqrtRatioAtTick(tickLower).toString() : '0',
      tickUpper > 0 ? TickMath.getSqrtRatioAtTick(tickUpper).toString() : '0',
    ],
    chainId,
    query: {
      enabled: Boolean(pool && isValid && tickLower > 0 && tickUpper > 0),
    },
  }) as { data: bigint[] | undefined };

  const { data: requiredCollateral, refetch: refetchRequiredCollateral } =
    useReadContract({
      abi: foilData.abi,
      address: marketAddress as `0x${string}`,
      functionName: 'quoteRequiredCollateral',
      args: [nftId, newLiquidity],
      query: {
        enabled: Boolean(isEdit),
      },
      chainId,
    });

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

  const deltaGasToken: number = useMemo(() => {
    if (!deltaTokenAmounts) return 0;
    return parseFloat(formatUnits(deltaTokenAmounts[0], TOKEN_DECIMALS));
  }, [deltaTokenAmounts]);

  const deltaEthToken: number = useMemo(() => {
    if (!deltaTokenAmounts) return 0;
    return parseFloat(formatUnits(deltaTokenAmounts[1], TOKEN_DECIMALS));
  }, [deltaTokenAmounts]);

  const minAmountDeltaGasToken: number = useMemo(() => {
    return (deltaGasToken * (100 - slippage)) / 100;
  }, [deltaGasToken, slippage]);

  const minAmountDeltaEthToken: number = useMemo(() => {
    return (deltaEthToken * (100 - slippage)) / 100;
  }, [deltaEthToken, slippage]);

  const walletBalance = useMemo(() => {
    if (!collateralAmountData || !isConnected) return '0';
    return formatUnits(
      BigInt(collateralAmountData.toString()),
      collateralAssetDecimals
    );
  }, [collateralAmountData, collateralAssetDecimals, isConnected]);

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

  const positionCollateralAfter: number = useMemo(() => {
    if (!isEdit) return parseFloat(depositAmount || '0');

    return Number(
      formatUnits(
        (requiredCollateral as bigint | undefined) || BigInt(0),
        collateralAssetDecimals
      )
    );
  }, [isEdit, depositAmount, requiredCollateral, collateralAssetDecimals]);

  const finalDelta: bigint = useMemo(() => {
    const currentDepositAmountBigInt = BigInt(
      positionData?.depositedCollateralAmount || 0
    );
    let newDepositAmountBigInt = parseUnits('0', collateralAssetDecimals);
    if (!isEdit && depositAmount !== '') {
      newDepositAmountBigInt = parseUnits(
        depositAmount,
        collateralAssetDecimals
      );
    } else if (isEdit && requiredCollateral) {
      newDepositAmountBigInt = requiredCollateral as bigint;
    }

    // Double-check the delta before submission
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
    isEdit,
    requiredCollateral,
  ]);

  const requireApproval: boolean = useMemo(() => {
    const collateralAmountDeltaFormatted = formatUnits(
      finalDelta,
      collateralAssetDecimals
    );
    if (isEdit && isDecrease) return false;
    if (finalDelta <= 0) return false;
    return (
      !allowance ||
      parseFloat(allowance) < parseFloat(collateralAmountDeltaFormatted)
    );
  }, [allowance, finalDelta, collateralAssetDecimals, isEdit, isDecrease]);

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
    const getNewDepositAmount = (): bigint => {
      if (isEdit) {
        return (requiredCollateral as bigint | undefined) || BigInt(0);
      }
      return parseUnits(
        depositAmount !== '' ? depositAmount : '0',
        collateralAssetDecimals
      );
    };

    const calculateDelta = () => {
      const newDepositAmountBigInt = getNewDepositAmount();
      const currentDepositAmountBigInt = BigInt(
        positionData?.depositedCollateralAmount || 0
      );
      return newDepositAmountBigInt - currentDepositAmountBigInt;
    };

    setCollateralAmountDelta(calculateDelta());
  }, [
    depositAmount,
    positionData,
    collateralAssetDecimals,
    isDecrease,
    isEdit,
    requiredCollateral,
  ]);

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
      refetchAllowance();
      handleCreateOrIncreaseLiquidity();
    }
  }, [isApproveSuccess, txnStep]);

  // handle successful add/increase liquidity
  useEffect(() => {
    if (increaseLiquiditySuccess) {
      setTxnSuccessMsg(
        'Successfully increased liquidity. Your transaction will be displayed in the app as soon as possible.'
      );
    }
  }, [increaseLiquiditySuccess]);

  useEffect(() => {
    if (decreaseLiquiditySuccess) {
      setTxnSuccessMsg(
        'Successfully decreased liquidity. Your transaction will be displayed in the app as soon as possible.'
      );
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
              `Your liquidity position has been created as position ${nftId}. Your transaction will be displayed in the app as soon as possible.`
            );
            setNftId(nftId);
            return;
          }
        } catch (error) {
          // This log was not for the LiquidityPositionCreated event, continue to next log
        }
      }
      setTxnSuccessMsg(
        `We've created your liquidity position for you. Your transaction will be displayed in the app as soon as possible.`
      );
    }
  }, [addLiquiditySuccess, addLiquidityReceipt]);

  useEffect(() => {
    // trader position so switch to trader tab
    if (positionData && positionData.kind === 2) {
      toast({
        title:
          'Your liquidity position has been closed and converted to a trader position with your accumulated position. Your transaction will be displayed in the app as soon as possible.',
        duration: 5000,
      });
      router.push(
        `/markets/${chainId}%3A${marketAddress}/periods/${epoch}/pool?positionId=${nftId}`
      );
    }
  }, [positionData, toast]);

  // handle token amounts error
  useEffect(() => {
    if (tokenAmountsError) {
      console.error('tokenAmountsError:', tokenAmountsError);
      toast({
        title: 'Failed to fetch token amounts',
        description: tokenAmountsError?.message,
        duration: 5000,
      });
    }
  }, [tokenAmountsError, toast]);

  // handle uniswap error
  useEffect(() => {
    if (uniswapPositionError && isEdit) {
      console.error('uniswapPositionError: ', uniswapPositionError);
      toast({
        title: 'Failed to get position from uniswap',
        description: uniswapPositionError?.message,
        duration: 5000,
      });
    }
  }, [uniswapPositionError, isEdit, toast]);

  useEffect(() => {
    if (isEdit) return;
    setValue('lowPrice', tickToPrice(baseAssetMinPriceTick).toString());
    setValue('highPrice', tickToPrice(baseAssetMaxPriceTick).toString());
  }, [baseAssetMinPriceTick, baseAssetMaxPriceTick, isEdit, setValue]);

  useEffect(() => {
    if (!uniswapPosition) return;
    const uniswapData = uniswapPosition as any[];
    const lowerTick = uniswapData[5];
    const upperTick = uniswapData[6];
    if (lowerTick) {
      setLowPriceTick(lowerTick);
      setValue('lowPrice', tickToPrice(lowerTick).toString(), {
        shouldValidate: false,
        shouldDirty: false,
        shouldTouch: false,
      });
    }
    if (upperTick) {
      setHighPriceTick(upperTick);
      setValue('highPrice', tickToPrice(upperTick).toString(), {
        shouldValidate: false,
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [uniswapPosition, setValue, setLowPriceTick, setHighPriceTick]);

  useEffect(() => {
    if (
      approveHash ||
      addLiquidityHash ||
      increaseLiquidityHash ||
      decreaseLiquidityHash
    ) {
      setPendingTxn(true);
    }
  }, [
    approveHash,
    addLiquidityHash,
    increaseLiquidityHash,
    decreaseLiquidityHash,
  ]);

  useEffect(() => {
    if (
      isApproveSuccess ||
      addLiquiditySuccess ||
      increaseLiquiditySuccess ||
      decreaseLiquiditySuccess
    ) {
      setPendingTxn(false);
    }
  }, [
    isApproveSuccess,
    addLiquiditySuccess,
    increaseLiquiditySuccess,
    decreaseLiquiditySuccess,
  ]);

  /// /// HANDLERS //////
  const getCurrentDeadline = (): bigint => {
    return BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 minutes from now
  };

  const adjustedBaseToken = baseToken * (1 - CREATE_LIQUIDITY_REDUCTION);
  const adjustedQuoteToken = quoteToken * (1 - CREATE_LIQUIDITY_REDUCTION);

  const handleCreateOrIncreaseLiquidity = () => {
    const deadline = getCurrentDeadline();
    if (isEdit) {
      if (!liquidity || !requiredCollateral) {
        console.log('noliquidity found');
        resetAfterError();
        return;
      }
      increaseLiquidity({
        address: foilData.address as `0x${string}`,
        abi: foilData.abi,
        functionName: 'increaseLiquidityPosition',
        args: [
          {
            positionId: nftId,
            collateralAmount: finalDelta,
            gasTokenAmount: parseUnits(
              deltaGasToken.toString(),
              TOKEN_DECIMALS
            ),
            ethTokenAmount: parseUnits(
              deltaEthToken.toString(),
              TOKEN_DECIMALS
            ),
            minGasAmount: parseUnits(
              minAmountDeltaGasToken.toString(),
              TOKEN_DECIMALS
            ),
            minEthAmount: parseUnits(
              minAmountDeltaEthToken.toString(),
              TOKEN_DECIMALS
            ),
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
    setTxnSuccessMsg('');
    setTxnStep(0);
    setPendingTxn(false);

    refetchAllowance();
    refetchRequiredCollateral();
    refetchUniswapPosition();
    refreshPositions();
    refetchPosition();
    refetchUniswapData();
    refetchCollateralAmount();
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

    const deadline = getCurrentDeadline();
    decreaseLiquidity({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'decreaseLiquidityPosition',
      args: [
        {
          positionId: nftId,
          liquidity: deltaLiquidity.toString(),
          minGasAmount: parseUnits(
            minAmountDeltaGasToken.toString(),
            TOKEN_DECIMALS
          ),
          minEthAmount: parseUnits(
            minAmountDeltaEthToken.toString(),
            TOKEN_DECIMALS
          ),
          deadline,
        },
      ],
      chainId,
    });
    setTxnStep(2);
  };
  const handleFormSubmit = () => {
    if (!isConnected) {
      return;
    }

    setPendingTxn(true);

    if (isEdit && isDecrease) {
      return handleDecreaseLiquidity();
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
        txt = liquidityAction === 'add' ? 'Add Liquidity' : 'Remove Liquidity';
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
        <Button className="w-full" size="lg" onClick={() => setIsOpen(true)}>
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

    const isDisabled =
      pendingTxn || isFetching || isAmountUnchanged || !isValid;

    return (
      <Button className="w-full" size="lg" type="submit" disabled={isDisabled}>
        {pendingTxn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {getButtonText()}
      </Button>
    );
  };

  // Set initial values when position loads
  useEffect(() => {
    if (isEdit) {
      setValue('modifyLiquidity', '0', {
        shouldValidate: false,
        shouldDirty: false,
        shouldTouch: false,
      });
    } else {
      setValue('depositAmount', '0', {
        shouldValidate: false,
        shouldDirty: false,
        shouldTouch: false,
      });
    }
  }, [nftId, positionData, isEdit, collateralAssetDecimals, setValue]);

  // Convert price from display units to market units
  const convertDisplayToMarketPrice = (displayPrice: number): number => {
    if (useMarketUnits) {
      return displayPrice;
    }
    // Convert from gwei to Ggas/wstETH
    return displayPrice / convertGgasPerWstEthToGwei(1, stEthPerToken);
  };

  // Convert price from market units to display units
  const convertMarketToDisplayPrice = (marketPrice: number): number => {
    if (useMarketUnits) {
      return marketPrice;
    }
    // Convert from Ggas/wstETH to gwei
    return convertGgasPerWstEthToGwei(marketPrice, stEthPerToken);
  };

  // Update form values when market units change
  useEffect(() => {
    // Use context ticks if available and non-zero, otherwise use market min/max ticks
    const lowTick =
      contextLowPriceTick !== undefined && contextLowPriceTick !== 0
        ? contextLowPriceTick
        : baseAssetMinPriceTick;
    const highTick =
      contextHighPriceTick !== undefined && contextHighPriceTick !== 0
        ? contextHighPriceTick
        : baseAssetMaxPriceTick;

    console.log('Ticks:', {
      lowTick,
      highTick,
      contextLowPriceTick,
      contextHighPriceTick,
      baseAssetMinPriceTick,
      baseAssetMaxPriceTick,
    });

    if (lowTick === undefined || highTick === undefined) {
      console.log('Ticks are undefined');
      return;
    }

    // Convert from ticks to market price
    const lowMarketPrice = tickToPrice(lowTick);
    const highMarketPrice = tickToPrice(highTick);

    console.log('Market Prices:', { lowMarketPrice, highMarketPrice });

    // Convert to display units based on current useMarketUnits setting
    const lowDisplayPrice = useMarketUnits
      ? lowMarketPrice
      : convertGgasPerWstEthToGwei(lowMarketPrice, stEthPerToken);
    const highDisplayPrice = useMarketUnits
      ? highMarketPrice
      : convertGgasPerWstEthToGwei(highMarketPrice, stEthPerToken);

    console.log('Display Prices:', {
      lowDisplayPrice,
      highDisplayPrice,
      useMarketUnits,
      stEthPerToken,
    });

    setValue('lowPrice', lowDisplayPrice.toString(), {
      shouldValidate: false,
      shouldDirty: false,
      shouldTouch: false,
    });
    setValue('highPrice', highDisplayPrice.toString(), {
      shouldValidate: false,
      shouldDirty: false,
      shouldTouch: false,
    });
  }, [
    useMarketUnits,
    stEthPerToken,
    contextLowPriceTick,
    contextHighPriceTick,
    baseAssetMinPriceTick,
    baseAssetMaxPriceTick,
    setValue,
  ]);

  const handlePriceBlur = (price: string, isLow: boolean) => {
    if (!isEdit) {
      const displayPrice = Number(price);
      const marketPrice = convertDisplayToMarketPrice(displayPrice);

      // Get min and max market prices
      const minMarketPrice = tickToPrice(baseAssetMinPriceTick);
      const maxMarketPrice = tickToPrice(baseAssetMaxPriceTick);

      // Get current other price value for comparison
      const otherPriceStr = isLow
        ? form.getValues('highPrice')
        : form.getValues('lowPrice');
      const otherDisplayPrice = Number(otherPriceStr);
      const otherMarketPrice = convertDisplayToMarketPrice(otherDisplayPrice);

      // Calculate price one tick spacing away from other price
      const otherTick = priceToTick(otherMarketPrice, tickSpacing);
      const oneTickAwayPrice = isLow
        ? tickToPrice(otherTick - tickSpacing) // One tick below high price
        : tickToPrice(otherTick + tickSpacing); // One tick above low price

      // Enforce min/max constraints in market units
      let constrainedMarketPrice = marketPrice;
      if (isLow) {
        // Low price must be between min price and one tick below high price
        constrainedMarketPrice = Math.min(
          Math.max(marketPrice, minMarketPrice),
          oneTickAwayPrice
        );
      } else {
        // High price must be between one tick above low price and max price
        constrainedMarketPrice = Math.max(
          Math.min(marketPrice, maxMarketPrice),
          oneTickAwayPrice
        );
      }

      const { tick, price: snappedMarketPrice } = snapPriceToTick(
        constrainedMarketPrice,
        tickSpacing
      );
      const snappedDisplayPrice =
        convertMarketToDisplayPrice(snappedMarketPrice);

      if (isLow) {
        setLowPriceTick(tick);
        setValue('lowPrice', snappedDisplayPrice.toString(), {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
      } else {
        setHighPriceTick(tick);
        setValue('highPrice', snappedDisplayPrice.toString(), {
          shouldValidate: true,
          shouldDirty: true,
          shouldTouch: true,
        });
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <h2 className="text-2xl font-semibold mb-3">Pool Liquidity</h2>
        <div className="mb-3">
          <LiquidityAmountInput
            isEdit={isEdit}
            walletBalance={walletBalance}
            positionCollateralAmount={positionCollateralAmount}
            collateralAssetTicker={collateralAssetTicker}
            onActionChange={setLiquidityAction}
          />
        </div>

        <LiquidityPriceInput
          label="Low Price"
          name="lowPrice"
          control={control}
          isDisabled={isEdit}
          onBlur={(e) => handlePriceBlur(e.target.value, true)}
        />

        <LiquidityPriceInput
          label="High Price"
          name="highPrice"
          control={control}
          isDisabled={isEdit}
          onBlur={(e) => handlePriceBlur(e.target.value, false)}
        />
        <SlippageTolerance />

        {renderActionButton()}

        <div className="flex flex-col gap-2 mt-4">
          <PositionSelector />

          <div>
            <p className="text-sm font-semibold mb-0.5">Virtual Ggas</p>
            <p className="text-sm mb-0.5">
              <NumberDisplay value={baseToken} /> vGgas (Min.{' '}
              <NumberDisplay value={minAmountTokenA} />)
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold mb-0.5">Virtual wstETH</p>
            <p className="text-sm mb-0.5">
              <NumberDisplay value={quoteToken} /> vWstETH (Min.{' '}
              <NumberDisplay value={minAmountTokenB} />)
            </p>
          </div>
          {isEdit && (
            <div>
              <p className="text-sm font-semibold mb-0.5">Liquidity</p>
              <p className="text-sm mb-0.5">
                <NumberDisplay
                  value={formatUnits(
                    liquidity || BigInt(0),
                    collateralAssetDecimals
                  )}
                />{' '}
                {!isAmountUnchanged && (
                  <>
                    {' '}
                    →{' '}
                    <NumberDisplay
                      value={formatUnits(
                        newLiquidity || BigInt(0),
                        collateralAssetDecimals
                      )}
                    />{' '}
                  </>
                )}
              </p>
            </div>
          )}

          {isEdit && (
            <div>
              <p className="text-sm font-semibold mb-0.5">
                Position Collateral
              </p>
              <p className="text-sm mb-0.5">
                <NumberDisplay value={positionCollateralAmount} />{' '}
                {collateralAssetTicker}
                {!isAmountUnchanged && (
                  <>
                    {' '}
                    → <NumberDisplay value={positionCollateralAfter} />{' '}
                    {collateralAssetTicker}
                  </>
                )}
              </p>
            </div>
          )}

          {isConnected && walletBalance && (
            <div>
              <p className="text-sm font-semibold mb-0.5">Wallet Balance</p>
              <p className="text-sm mb-0.5">
                <NumberDisplay value={walletBalance} /> {collateralAssetTicker}
                {!isAmountUnchanged && walletBalanceAfter && (
                  <>
                    {' '}
                    → <NumberDisplay value={walletBalanceAfter} />{' '}
                    {collateralAssetTicker}
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </form>
    </Form>
  );
};

export default LiquidityForm;
