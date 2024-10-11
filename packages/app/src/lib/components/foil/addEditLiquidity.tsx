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
  RangeSlider,
  RangeSliderFilledTrack,
  RangeSliderThumb,
  RangeSliderTrack,
  RangeSliderMark,
  Flex,
  useToast,
} from '@chakra-ui/react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { TickMath, SqrtPriceMath } from '@uniswap/v3-sdk';
import JSBI from 'jsbi';
import { useContext, useEffect, useMemo, useState } from 'react';
import type { WriteContractErrorType } from 'viem';
import { formatUnits, parseUnits } from 'viem';
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
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { useLoading } from '~/lib/context/LoadingContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

import NumberDisplay from './numberDisplay';
import SlippageTolerance from './slippageTolerance';

// TODO 1% - Hardcoded for now, should be retrieved with pool.tickSpacing()
const tickSpacingDefault = 200; 
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

const AddEditLiquidity: React.FC<{
  handleTabChange: (index: number, hasConvertedToTrader: boolean) => void;
}> = ({ handleTabChange }) => {
  const { nftId, refreshPositions } = useAddEditPosition();

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

  const [depositAmount, setDepositAmount] = useState(0);
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

  const tickLower = priceToTick(lowPrice, tickSpacingDefault);
  const tickUpper = priceToTick(highPrice, tickSpacingDefault);
  const isEdit = nftId > 0;

  const [collateralAmountDelta, setCollateralAmountDelta] = useState<bigint>(
    BigInt(0)
  );

  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { openConnectModal } = useConnectModal();

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
    functionName: 'getTokenAmounts',
    args: [
      epoch.toString(),
      parseUnits(depositAmount.toString(), collateralAssetDecimals), // uint256 collateralAmount
      pool ? pool.sqrtRatioX96.toString() : '0', // uint160 sqrtPriceX96, // current price of pool
      tickLower > 0 ? TickMath.getSqrtRatioAtTick(tickLower).toString() : '0', // uint160 sqrtPriceAX96, // lower tick price in sqrtRatio
      tickUpper > 0 ? TickMath.getSqrtRatioAtTick(tickUpper).toString() : '0', // uint160 sqrtPriceBX96 // upper tick price in sqrtRatio
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
        tickLower > 0 ? TickMath.getSqrtRatioAtTick(tickLower).toString() : '0', // uint160 sqrtPriceAX96, // lower tick price in sqrtRatio
        tickUpper > 0 ? TickMath.getSqrtRatioAtTick(tickUpper).toString() : '0', // uint160 sqrtPriceBX96 // upper tick price in sqrtRatio
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

  const { isSuccess: addLiquiditySuccess } = useWaitForTransactionReceipt({
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
      setTxnSuccessMsg('Successfully added liquidity');
    }
  }, [addLiquiditySuccess]);

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
      handleTabChange(0, true);
    }
  }, [positionData, toast, handleTabChange]);

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
              depositAmount.toString(),
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
    e.preventDefault();

    if (isEdit && isDecrease) {
      return handleDecreaseLiquidity();
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
    console.log('***********');
    console.log('allowance', allowance);
    console.log(
      'collateralAmountDeltaFormatted',
      collateralAmountDeltaFormatted
    );
    console.log('FINAL DELTA =', finalDelta);

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

  const getButtonText = () => {
    if (isEdit && isDecrease) {
      return depositAmount !== 0
        ? 'Decrease Liquidity'
        : 'Close Liquidity Position';
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

    const isAmountUnchanged = isEdit && depositAmount === positionCollateralAmount;
    const isZeroDeposit = !isEdit && depositAmount === 0;

    return (
      <Button
        width="full"
        variant="brand"
        size="lg"
        type="submit"
        isLoading={pendingTxn || isFetching}
        isDisabled={pendingTxn || isFetching || isAmountUnchanged || isZeroDeposit}
      >
        {getButtonText()}
      </Button>
    );
  };

  return (
    <form onSubmit={handleFormSubmit}>
      <Box mb={4}>
        <FormControl>
          <FormLabel>Collateral</FormLabel>
          <InputGroup>
            <Input
              type="number"
              min={0}
              step="any"
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
            step="any"
            disabled={isEdit}
            onWheel={(e) => e.currentTarget.blur()}
            value={lowPrice}
            onChange={(e) => setLowPrice(Number(e.target.value))}
          />
          <InputRightAddon>Ggas/{collateralAssetTicker}</InputRightAddon>
        </InputGroup>
      </FormControl>
      <FormControl mb={4}>
        <FormLabel>High Price</FormLabel>
        <InputGroup>
          <Input
            type="number"
            min={0}
            step="any"
            disabled={isEdit}
            onWheel={(e) => e.currentTarget.blur()}
            value={highPrice}
            onChange={(e) => setHighPrice(Number(e.target.value))}
          />
          <InputRightAddon>Ggas/{collateralAssetTicker}</InputRightAddon>
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

        {isConnected &&
          walletBalance !== null &&
          walletBalanceAfter !== null && (
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