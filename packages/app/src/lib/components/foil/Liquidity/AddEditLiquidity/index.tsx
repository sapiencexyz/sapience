/* eslint-disable sonarjs/cognitive-complexity */

'use client';

// eslint-disable-next-line import/no-extraneous-dependencies
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { TickMath } from '@uniswap/v3-sdk';
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
import NumberDisplay from '../../numberDisplay';
import PositionSelector from '../../positionSelector';
import SlippageTolerance from '../../slippageTolerance';
import LiquidityAmountInput from '../LiquidityAmountInput';
import LiquidityPriceInput from '../LiquidityPriceInput';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { useToast } from '~/hooks/use-toast';
import {
  CREATE_LIQUIDITY_REDUCTION,
  TICK_SPACING_DEFAULT,
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';
import { getTokenAmountsFromNewLiqudity } from '~/lib/util/liquidityUtil';

// TODO 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()
// Also move this a to helper?
const tickToPrice = (tick: number): number => 1.0001 ** tick;
const priceToTick = (price: number, tickSpacing: number): number => {
  const tick = Math.log(price) / Math.log(1.0001);
  return Math.round(tick / tickSpacing) * tickSpacing;
};

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
      depositAmount: '0',
      modifyLiquidity: '100',
      lowPrice: epochParams?.baseAssetMinPriceTick
        ? tickToPrice(epochParams.baseAssetMinPriceTick).toString()
        : '0',
      highPrice: epochParams?.baseAssetMaxPriceTick
        ? tickToPrice(epochParams.baseAssetMaxPriceTick).toString()
        : '0',
      slippage: '0.5',
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
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

  const lowPrice = useWatch({
    control,
    name: 'lowPrice',
  });

  const highPrice = useWatch({
    control,
    name: 'highPrice',
  });

  const slippageStr = useWatch({
    control,
    name: 'slippage',
  });
  const slippage = Number(slippageStr);

  const [txnStep, setTxnStep] = useState<number>(0);
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
  const isDecrease = isEdit && Number(modifyLiquidity) < 100;

  const newLiquidity = useMemo(() => {
    if (!liquidity) return BigInt(0);
    const jsbiNewLiq = JSBI.divide(
      JSBI.multiply(
        JSBI.BigInt(liquidity.toString()),
        JSBI.BigInt(modifyLiquidity)
      ),
      JSBI.BigInt(100)
    );
    return BigInt(jsbiNewLiq.toString());
  }, [modifyLiquidity, liquidity]);

  const { data: requiredCollateral } = useReadContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteRequiredCollateral',
    args: [nftId, newLiquidity],
    query: {
      enabled: Boolean(isEdit),
    },
    chainId,
  }) as { data: bigint | undefined };

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

  const positionCollateralAfter: number = useMemo(() => {
    if (!isEdit) return parseFloat(depositAmount || '0');

    // TODO: FIX THIS ONCE WE HAVE THE QUOTE FUNCTION
    // if increasing
    if (!isDecrease) {
      return Number(
        formatUnits(requiredCollateral || BigInt(0), collateralAssetDecimals)
      );
    }
    // if decreasing
    return parseFloat(depositAmount || '0');
  }, [
    isEdit,
    depositAmount,
    isDecrease,
    requiredCollateral,
    collateralAssetDecimals,
  ]);

  const finalDelta: bigint = useMemo(() => {
    if (!isEdit) {
      // Double-check the delta before submission
      const newDepositAmountBigInt = parseUnits(
        depositAmount !== '' ? depositAmount : '0',
        collateralAssetDecimals
      );

      const currentDepositAmountBigInt = BigInt(
        positionData?.depositedCollateralAmount || 0
      );
      const calculatedDelta =
        newDepositAmountBigInt - currentDepositAmountBigInt;

      // Use the calculated delta if it differs from the state (shouldn't happen, but just in case)
      return calculatedDelta !== collateralAmountDelta
        ? calculatedDelta
        : collateralAmountDelta;
    }
    return BigInt(0);
  }, [
    depositAmount,
    positionData,
    collateralAssetDecimals,
    collateralAmountDelta,
    isEdit,
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
    const getNewDepositAmount = (): bigint => {
      if (isEdit) {
        // if increasing
        if (!isDecrease) {
          return requiredCollateral || BigInt(0);
        }
        // TODO:
        // if decreasing
        return BigInt(0);
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
      const {
        gasAmountDelta,
        ethAmountDelta,
        minEthAmountDelta,
        minGasAmountDelta,
      } = getTokenAmountsFromNewLiqudity(
        newLiquidity,
        liquidity,
        tickLower,
        tickUpper,
        slippage
      );
      increaseLiquidity({
        address: foilData.address as `0x${string}`,
        abi: foilData.abi,
        functionName: 'increaseLiquidityPosition',
        args: [
          {
            positionId: nftId,
            collateralAmount: requiredCollateral,
            gasTokenAmount: gasAmountDelta,
            ethTokenAmount: ethAmountDelta,
            minGasAmount: minEthAmountDelta,
            minEthAmount: minGasAmountDelta,
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

    const { liquidityDelta, minGasAmountDelta, minEthAmountDelta } =
      getTokenAmountsFromNewLiqudity(
        newLiquidity,
        liquidity,
        tickLower,
        tickUpper,
        slippage
      );

    const deadline = getCurrentDeadline();
    decreaseLiquidity({
      address: foilData.address as `0x${string}`,
      abi: foilData.abi,
      functionName: 'decreaseLiquidityPosition',
      args: [
        {
          positionId: nftId,
          liquidity: liquidityDelta,
          minGasAmount: minGasAmountDelta,
          minEthAmount: minEthAmountDelta,
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

  // Set initial values when position loads
  useEffect(() => {
    if (isEdit) {
      setValue('modifyLiquidity', '100', {
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
  }, [nftId, positionData, isEdit, setValue]);

  console.log('requiredCollateral', requiredCollateral);

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <h2 className="text-xl font-semibold mb-3">Pool Liquidity</h2>
        <div> requiredCollateral {requiredCollateral?.toString()}</div>
        <div> liquidity {liquidity?.toString()}</div>
        <div> new liquidity {newLiquidity.toString()}</div>
        <div> modifyLiquidity {modifyLiquidity}</div>
        <LiquidityAmountInput
          isEdit={isEdit}
          walletBalance={walletBalance}
          positionCollateralAmount={positionCollateralAmount}
          collateralAssetTicker={collateralAssetTicker}
        />

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
