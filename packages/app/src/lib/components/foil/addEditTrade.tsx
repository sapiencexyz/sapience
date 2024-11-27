/* eslint-disable sonarjs/cognitive-complexity */
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { HelpCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useState, useEffect, useContext, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import type { AbiFunction } from 'viem';
import { decodeEventLog, formatUnits, parseUnits, zeroAddress } from 'viem';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
  useSimulateContract,
  useChainId,
  useSwitchChain,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import { Button } from '~/components/ui/button';
import { Form } from '~/components/ui/form';
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useToast } from '~/hooks/use-toast';
import {
  HIGH_PRICE_IMPACT,
  MIN_BIG_INT_SIZE,
  TOKEN_DECIMALS,
} from '~/lib/constants/constants';
import { useAddEditPosition } from '~/lib/context/AddEditPositionContext';
import { MarketContext } from '~/lib/context/MarketProvider';
import type { FoilPosition } from '~/lib/interfaces/interfaces';

import NumberDisplay from './numberDisplay';
import PositionSelector from './positionSelector';
import SlippageTolerance from './slippageTolerance';
import TradeSizeInput from './Trade/TradeSizeInput';

export default function AddEditTrade() {
  const { nftId, refreshPositions, setNftId } = useAddEditPosition();

  // form states
  const form = useForm({
    defaultValues: {
      sizeCollateralInput: '', // the display value of the size/collateral input
      size: BigInt(0), // the actual size value
      fetchingSizeFromCollateralInput: false, // whether we're currently fetching the size from collateral
      inputType: 'Ggas', // the unit type of the size/collateral input
      option: 'Long',
      slippage: '0.5',
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  const {
    handleSubmit,
    formState: { errors, isDirty },
    reset,
    watch,
    setValue,
  } = form;

  // Watch slippage value from form
  const formSlippage = watch('slippage');
  const sizeChangeInGas: bigint = watch('size');
  const sizeCollateralInput = watch('sizeCollateralInput');
  const inputType = watch('inputType');
  const fetchingSizeFromCollateralInput = watch(
    'fetchingSizeFromCollateralInput'
  );
  const sizeChangeIsNonzero = sizeChangeInGas !== BigInt(0);
  const getMin = () => {
    if (inputType === 'collateral') return 0;
    if (inputType === 'Ggas') return 1e-9;
    return 1;
  };
  const minInputValue: number = getMin();

  const [option, setOption] = useState<'Long' | 'Short'>('Long');

  // component states
  const [pendingTxn, setPendingTxn] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<string>('0');
  const [quotedResultingWalletBalance, setQuotedResultingWalletBalance] =
    useState<string>('0');
  const [walletBalanceLimit, setWalletBalanceLimit] = useState<bigint>(
    BigInt(0)
  );
  const [positionCollateralLimit, setPositionCollateralLimit] =
    useState<bigint>(BigInt(0));
  const [resultingPositionCollateral, setResultingPositionCollateral] =
    useState<bigint>(BigInt(0));
  const [txnStep, setTxnStep] = useState(0);

  const account = useAccount();
  const { isConnected, address } = account;
  const isEdit = !!nftId;

  const {
    address: marketAddress,
    collateralAsset,
    collateralAssetTicker,
    collateralAssetDecimals,
    epoch,
    foilData,
    chainId,
    pool,
    liquidity,
    refetchUniswapData,
  } = useContext(MarketContext);

  if (!epoch) {
    throw new Error('Epoch is not defined');
  }

  const { toast } = useToast();

  const isLong = option === 'Long';

  const formError = useMemo(() => {
    if (Number(quotedResultingWalletBalance) < 0) {
      return 'Insufficient wallet balance to perform this trade.';
    }
    const sizeChangeGgas = Number(formatUnits(sizeChangeInGas, 9));
    if (
      sizeChangeIsNonzero &&
      (!liquidity || (isLong && sizeChangeGgas > liquidity))
    ) {
      return 'Not enough liquidity to perform this trade.';
    }
    if (quoteError) {
      console.error('quoteError', quoteError);
      return 'The protocol cannot generate a quote for this order.';
    }
    if (
      (isDirty && sizeCollateralInput === '') ||
      sizeCollateralInput === '0'
    ) {
      return 'Size is required';
    }
    if (isDirty && Number(sizeCollateralInput) < minInputValue)
      return `Size must be greater than ${minInputValue} ${inputType}`;

    if (
      inputType === 'collateral' &&
      Number(sizeCollateralInput) !== 0 &&
      sizeChangeInGas === BigInt(0) &&
      !fetchingSizeFromCollateralInput
    ) {
      return 'Unable to find a size for this collateral amount';
    }
    return '';
  }, [
    quoteError,
    liquidity,
    sizeChangeInGas,
    isLong,
    quotedResultingWalletBalance,
    inputType,
    minInputValue,
    sizeCollateralInput,
    isDirty,
    sizeChangeIsNonzero,
    fetchingSizeFromCollateralInput,
  ]);

  // Position data
  const { data: positionData, refetch: refetchPositionData } = useReadContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'getPosition',
    args: [nftId],
    query: {
      enabled: isEdit,
    },
  }) as { data: FoilPosition; refetch: any; isRefetching: boolean };

  useEffect(() => {
    if (positionData && isEdit) {
      setOption(positionData.vGasAmount > BigInt(0) ? 'Long' : 'Short');
    }
    setValue('size', BigInt(0), { shouldDirty: false });
    setValue('sizeCollateralInput', '', { shouldDirty: false });
  }, [positionData, isEdit, setValue]);

  const originalPositionSizeInContractUnit: bigint = useMemo(() => {
    if (isEdit && positionData) {
      const sideFactor =
        positionData.vGasAmount > BigInt(0) ? BigInt(1) : BigInt(-1);
      const _sizeBigInt =
        positionData.vGasAmount > BigInt(0)
          ? positionData.vGasAmount
          : positionData.borrowedVGas;
      const adjustedSize =
        _sizeBigInt >= MIN_BIG_INT_SIZE ? _sizeBigInt : BigInt(0);
      return sideFactor * adjustedSize;
    }

    return BigInt(0);
  }, [positionData, isEdit]);

  const desiredSizeInContractUnit = useMemo(() => {
    if (!isEdit) return sizeChangeInGas;

    const originalPositionIsLong = positionData?.vGasAmount > BigInt(0);
    const currentSize = originalPositionIsLong
      ? positionData?.vGasAmount || BigInt(0)
      : -(positionData?.borrowedVGas || BigInt(0));

    return currentSize + sizeChangeInGas * BigInt(1e9);
  }, [isEdit, positionData, sizeChangeInGas]);

  // Collateral balance for current address/account
  const { data: collateralBalance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'balanceOf',
    args: [address],
    chainId,
  });

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, marketAddress],
    account: address || zeroAddress,
    chainId,
  });

  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [epoch, desiredSizeInContractUnit],
    chainId,
    account: address || zeroAddress,
    query: { enabled: !isEdit && sizeChangeIsNonzero },
  });

  const quoteModifyPositionResult = useSimulateContract({
    abi: foilData.abi,
    address: marketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: [nftId, desiredSizeInContractUnit],
    chainId,
    account: address || zeroAddress,
    query: { enabled: isEdit && sizeChangeIsNonzero },
  });

  useEffect(() => {
    if (quoteModifyPositionResult?.error && isEdit && sizeChangeIsNonzero) {
      setQuoteError(quoteModifyPositionResult.error.message);
    } else if (quoteCreatePositionResult.error && !isEdit) {
      setQuoteError(quoteCreatePositionResult.error.message);
    } else {
      setQuoteError(null);
    }
  }, [
    quoteCreatePositionResult.error,
    quoteModifyPositionResult?.error,
    sizeChangeInGas,
    isEdit,
    sizeChangeIsNonzero,
  ]);

  const isLoadingCollateralChange = isEdit
    ? quoteModifyPositionResult.isFetching
    : quoteCreatePositionResult.isFetching;

  // Write contract hooks
  const { data: hash, writeContract } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `There was an issue creating/updating your position: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Transaction Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { data: approveHash, writeContract: approveWrite } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Approval Failed',
          description: `Failed to approve: ${(error as Error).message}`,
        });
        setPendingTxn(false);
      },
      onSuccess: () => {
        toast({
          title: 'Approval Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { isSuccess: isConfirmed, data: transactionReceipt } =
    useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isConfirmed && txnStep === 2) {
      if (isEdit) {
        toast({
          title: 'Success',
          description: "We've updated your position for you.",
        });
        resetAfterSuccess();
      } else {
        for (const log of transactionReceipt.logs) {
          try {
            const event = decodeEventLog({
              abi: foilData.abi,
              data: log.data,
              topics: log.topics,
            });

            if ((event as any).eventName === 'TraderPositionCreated') {
              const nftId = (event as any).args.positionId.toString();
              toast({
                title: 'Position Created',
                description: `Your position has been created as position ${nftId}`,
              });
              setNftId(nftId);
              resetAfterSuccess();
              return;
            }
          } catch (error) {
            // This log was not for the TraderPositionCreated event, continue to next log
          }
        }
        toast({
          title: 'Success',
          description: "We've created your position for you.",
        });
        resetAfterSuccess();
      }
    }
  }, [isConfirmed, transactionReceipt, txnStep]);

  useEffect(() => {
    if (approveSuccess && txnStep === 1) {
      refetchAllowance();
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

      if (isEdit) {
        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'modifyTraderPosition',
          args: [
            nftId,
            desiredSizeInContractUnit,
            collateralDeltaLimit,
            deadline,
          ],
        });
      } else {
        writeContract({
          abi: foilData.abi,
          address: marketAddress as `0x${string}`,
          functionName: 'createTraderPosition',
          args: [
            epoch,
            desiredSizeInContractUnit,
            collateralDeltaLimit,
            deadline,
          ],
        });
      }
      setTxnStep(2);
    }
  }, [approveSuccess, txnStep]);

  const [quotedCollateralDelta, quotedFillPrice] = useMemo(() => {
    const result = isEdit
      ? quoteModifyPositionResult.data?.result
      : quoteCreatePositionResult.data?.result;

    if (!result) {
      return [BigInt(0), BigInt(0)];
    }

    if (isEdit) {
      const [expectedCollateralDelta, closePnL, fillPrice] = result;
      return [expectedCollateralDelta, fillPrice];
    }
    const [requiredCollateral, fillPrice] = result;
    return [requiredCollateral, fillPrice];
  }, [isEdit, quoteCreatePositionResult.data, quoteModifyPositionResult.data]);

  const priceImpact: number = useMemo(() => {
    if (pool?.token0Price && quotedFillPrice && sizeChangeIsNonzero) {
      const fillPrice = Number(quotedFillPrice) / 1e18;
      const referencePrice = parseFloat(pool.token0Price.toSignificant(18));
      return Math.abs((fillPrice / referencePrice - 1) * 100);
    }
    return 0;
  }, [quotedFillPrice, pool]);
  const showPriceImpactWarning = priceImpact > HIGH_PRICE_IMPACT;

  // Calculate collateralDeltaLimit using watched slippage value
  const collateralDeltaLimit = useMemo(() => {
    if (quotedCollateralDelta === BigInt(0)) return BigInt(0);

    const slippageValue = Number(formSlippage); // Convert to number
    const slippageMultiplier = BigInt(Math.floor((100 + slippageValue) * 100));
    const slippageReductionMultiplier = BigInt(
      Math.floor((100 - slippageValue) * 100)
    );

    if (quotedCollateralDelta > BigInt(0)) {
      return (quotedCollateralDelta * slippageMultiplier) / BigInt(10000);
    }

    return (
      (quotedCollateralDelta * slippageReductionMultiplier) / BigInt(10000)
    );
  }, [quotedCollateralDelta, formSlippage]);

  // Update handleSubmit to use form values
  const onSubmit = async (values: any) => {
    if (!isConnected) {
      return;
    }

    setPendingTxn(true);

    if (requireApproval) {
      approveWrite({
        abi: erc20ABI as AbiFunction[],
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [marketAddress, collateralDeltaLimit],
      });
      setTxnStep(1);
    } else if (isEdit) {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'modifyTraderPosition',
        args: [
          nftId,
          desiredSizeInContractUnit,
          collateralDeltaLimit,
          deadline,
        ],
      });
      setTxnStep(2);
    } else {
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
      writeContract({
        abi: foilData.abi,
        address: marketAddress as `0x${string}`,
        functionName: 'createTraderPosition',
        args: [
          epoch,
          desiredSizeInContractUnit,
          collateralDeltaLimit,
          deadline,
        ],
      });
      setTxnStep(2);
    }
  };

  // Update resetAfterSuccess to reset form values properly
  const resetAfterSuccess = () => {
    reset({
      size: BigInt(0),
      option: 'Long',
      sizeCollateralInput: '',
      slippage: '0.5',
      fetchingSizeFromCollateralInput: false,
    });
    setPendingTxn(false);
    refreshPositions();
    refetchPositionData();
    refetchUniswapData();
    refetchAllowance();
    setTxnStep(0);
  };

  useEffect(() => {
    if (collateralBalance) {
      const newWalletBalance = formatUnits(
        collateralBalance as bigint,
        collateralAssetDecimals
      );
      setWalletBalance(newWalletBalance);

      const newQuotedResultingWalletBalance = formatUnits(
        (collateralBalance as bigint) - quotedCollateralDelta,
        collateralAssetDecimals
      );
      setQuotedResultingWalletBalance(newQuotedResultingWalletBalance);

      const newWalletBalanceLimit =
        parseUnits(newWalletBalance, collateralAssetDecimals) -
        collateralDeltaLimit;
      setWalletBalanceLimit(newWalletBalanceLimit);
    }

    const newPositionCollateralLimit =
      (positionData?.depositedCollateralAmount || BigInt(0)) +
      collateralDeltaLimit;
    setPositionCollateralLimit(newPositionCollateralLimit);

    const newResultingPositionCollateral =
      (positionData?.depositedCollateralAmount || BigInt(0)) +
      quotedCollateralDelta;
    setResultingPositionCollateral(newResultingPositionCollateral);
  }, [
    collateralBalance,
    collateralAssetDecimals,
    collateralDeltaLimit,
    positionData,
    quotedCollateralDelta,
  ]);

  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();

  const { openConnectModal } = useConnectModal();

  const handleTabChange = (value: string) => {
    setOption(value as 'Long' | 'Short');
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button
          className="w-full mb-4"
          variant="default"
          size="lg"
          onClick={openConnectModal}
        >
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== chainId) {
      return (
        <Button
          className="w-full mb-4"
          variant="default"
          size="lg"
          onClick={() => switchChain({ chainId })}
        >
          Switch Network
        </Button>
      );
    }

    const isFetchingQuote = isEdit
      ? quoteModifyPositionResult.isFetching
      : quoteCreatePositionResult.isFetching;
    const isLoading =
      pendingTxn ||
      fetchingSizeFromCollateralInput ||
      isLoadingCollateralChange ||
      (sizeChangeIsNonzero && isFetchingQuote);

    let buttonTxt = isEdit ? 'Update Position' : 'Create Position';
    if (desiredSizeInContractUnit === BigInt(0) && sizeChangeIsNonzero) {
      buttonTxt = 'Close Position';
    }
    if (requireApproval) {
      buttonTxt = `Approve ${collateralAssetTicker} Transfer`;
    }
    if (isFetchingQuote && !formError) {
      buttonTxt = 'Fetching Collateral Change...';
    }
    if (fetchingSizeFromCollateralInput) {
      buttonTxt = 'Fetching Size Change....';
    }
    return (
      <div className="mb-4">
        <Button
          className="w-full"
          variant="default"
          type="submit"
          disabled={!!formError || isLoading || !sizeChangeIsNonzero}
          size="lg"
        >
          {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : null}
          {buttonTxt}
        </Button>
        {renderPriceImpactWarning()}
      </div>
    );
  };

  const renderPriceImpactWarning = () => {
    if (!showPriceImpactWarning) return null;
    return (
      <p className="text-red-500 text-sm text-center mt-1 font-medium">
        <AlertTriangle className="inline-block w-4 h-4 mr-1" />
        Very high price impact ({Number(priceImpact.toFixed(2)).toString()}%)
      </p>
    );
  };

  const requireApproval: boolean = useMemo(() => {
    return !allowance || collateralDeltaLimit > (allowance as bigint);
  }, [allowance, collateralDeltaLimit]);

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <h2 className="text-lg font-semibold mb-3">Trade</h2>

        <Tabs
          defaultValue="Long"
          value={option}
          onValueChange={handleTabChange}
          className="mb-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="Long">Long</TabsTrigger>
            <TabsTrigger value="Short">Short</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mb-4">
          <div className={errors.size ? 'space-y-1' : ''}>
            <div className="relative flex">
              <TradeSizeInput
                nftId={nftId}
                positionData={positionData}
                isLong={isLong}
                allowCollateralInput
                error={formError}
                minInputValue={minInputValue}
              />
            </div>
            {errors.size && (
              <p className="text-sm text-destructive">
                {errors.size.message?.toString()}
              </p>
            )}
          </div>
        </div>

        <SlippageTolerance />
        {renderActionButton()}

        <div className="flex flex-col gap-2">
          <PositionSelector isLP={false} />
          {isEdit && (
            <div>
              <p className="text-sm text-gray-600 font-semibold mb-0.5">
                Position Size
              </p>
              <p className="text-sm text-gray-600 mb-0.5">
                <NumberDisplay
                  value={formatUnits(
                    originalPositionSizeInContractUnit,
                    TOKEN_DECIMALS
                  )}
                />{' '}
                Ggas
                {sizeChangeIsNonzero && (
                  <>
                    {' '}
                    →{' '}
                    <NumberDisplay
                      value={formatUnits(
                        desiredSizeInContractUnit,
                        TOKEN_DECIMALS
                      )}
                    />{' '}
                    Ggas
                  </>
                )}
              </p>
            </div>
          )}
          {!isLoadingCollateralChange && isConnected && (
            <div>
              <p className="text-sm text-gray-600 font-semibold mb-0.5 flex items-center">
                Wallet Balance
                {sizeChangeIsNonzero && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="w-4 h-4 ml-1" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Your slippage tolerance sets a maximum limit on how much
                        additional collateral Foil can use or the minimum amount
                        of collateral you will receive back, protecting you from
                        unexpected market changes between submitting and
                        processing your transaction.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </p>
              <p className="text-sm text-gray-600">
                <NumberDisplay value={walletBalance} /> {collateralAssetTicker}
                {sizeChangeIsNonzero && !quoteError && (
                  <>
                    {' '}
                    → <NumberDisplay
                      value={quotedResultingWalletBalance}
                    />{' '}
                    {collateralAssetTicker} (Min.{' '}
                    <NumberDisplay
                      value={formatUnits(
                        walletBalanceLimit,
                        collateralAssetDecimals
                      )}
                    />{' '}
                    {collateralAssetTicker})
                  </>
                )}
              </p>
            </div>
          )}
          {!isLoadingCollateralChange && (
            <div>
              <p className="text-sm text-gray-600 font-semibold mb-0.5">
                Position Collateral
              </p>
              <p className="text-sm text-gray-600 mb-0.5">
                <NumberDisplay
                  value={formatUnits(
                    positionData?.depositedCollateralAmount || BigInt(0),
                    collateralAssetDecimals
                  )}
                />{' '}
                {collateralAssetTicker}
                {sizeChangeIsNonzero && !quoteError && (
                  <>
                    {' '}
                    →{' '}
                    <NumberDisplay
                      value={formatUnits(
                        resultingPositionCollateral,
                        collateralAssetDecimals
                      )}
                    />{' '}
                    {collateralAssetTicker} (Max.{' '}
                    <NumberDisplay
                      value={formatUnits(
                        positionCollateralLimit,
                        collateralAssetDecimals
                      )}
                    />{' '}
                    {collateralAssetTicker})
                  </>
                )}
              </p>
            </div>
          )}
          {quotedFillPrice && (
            <div>
              <p className="text-sm text-gray-600 font-semibold mb-0.5">
                Estimated Fill Price
              </p>
              <p className="text-sm text-gray-600 mb-0.5">
                <NumberDisplay value={quotedFillPrice} /> Ggas/
                {collateralAssetTicker}
              </p>
            </div>
          )}
          {priceImpact !== 0 && (
            <div>
              <p className="text-sm text-gray-600 font-semibold mb-0.5">
                Estimated Price Impact
              </p>
              <p
                className={`${showPriceImpactWarning ? 'text-red-500' : 'text-gray-600'} text-sm font-medium mb-0.5`}
              >
                {Number(priceImpact.toFixed(2)).toString()}%
              </p>
            </div>
          )}
        </div>
      </form>
    </Form>
  );
}
