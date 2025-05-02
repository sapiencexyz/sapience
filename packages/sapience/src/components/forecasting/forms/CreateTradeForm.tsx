import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { SlippageTolerance } from '@foil/ui/components/SlippageTolerance';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@foil/ui/components/ui/alert';
import { Badge } from '@foil/ui/components/ui/badge';
import { Button } from '@foil/ui/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@foil/ui/components/ui/form';
import { Input } from '@foil/ui/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@foil/ui/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@foil/ui/components/ui/tooltip';
import { useToast } from '@foil/ui/hooks/use-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { Abi } from 'viem';
import { formatUnits, parseUnits, zeroAddress } from 'viem';
import {
  useAccount,
  useChainId,
  useSimulateContract,
  useSwitchChain,
} from 'wagmi';

import LottieLoader from '~/components/shared/LottieLoader';
import { useUniswapPool } from '~/hooks/charts/useUniswapPool';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useTokenBalance } from '~/hooks/contract/useTokenBalance';
import { useTradeForm } from '~/hooks/forms/useTradeForm';
import { HIGH_PRICE_IMPACT, TOKEN_DECIMALS } from '~/lib/constants/numbers';
import { useForecast } from '~/lib/context/ForecastProvider';

const COLLATERAL_DECIMALS = TOKEN_DECIMALS;

export type TradeFormMarketDetails = {
  marketAddress: `0x${string}`;
  chainId: number;
  numericMarketId: number;
  marketAbi: Abi;
  collateralAssetTicker: string;
  collateralAssetAddress?: `0x${string}`;
  // Add any other market-specific details needed for trading
};

export interface TradeFormProps {
  marketDetails: TradeFormMarketDetails;
  isConnected?: boolean;
  onConnectWallet?: () => void;
  onSuccess?: (txHash: `0x${string}`) => void;
  permitData?: { permitted?: boolean } | null | undefined;
  isPermitLoadingPermit?: boolean;
}

export function CreateTradeForm({
  marketDetails,
  isConnected = false,
  onConnectWallet,
  onSuccess,
  permitData,
  isPermitLoadingPermit = false,
}: TradeFormProps) {
  const { toast } = useToast();
  const { baseTokenName, marketContractData, quoteTokenName } = useForecast();
  const { address: accountAddress } = useAccount();
  const currentChainId = useChainId();
  const {
    switchChain,
    isPending: isSwitchingChain,
    error: switchChainError,
  } = useSwitchChain();

  const {
    marketAddress,
    chainId,
    marketAbi,
    collateralAssetTicker,
    collateralAssetAddress,
    numericMarketId,
  } = marketDetails;

  const isChainMismatch = isConnected && currentChainId !== chainId;

  const { balance: walletBalance } = useTokenBalance({
    tokenAddress: collateralAssetAddress,
    chainId,
    enabled: isConnected && !!collateralAssetAddress,
  });

  const form = useTradeForm();
  const { control, watch, handleSubmit, setValue, formState } = form;

  const sizeInput = watch('size');
  const direction = watch('direction');
  const slippage = watch('slippage');

  const slippageAsNumber = slippage ? Number(slippage) : 0.5;

  const sizeBigInt = React.useMemo(() => {
    try {
      return parseUnits(sizeInput || '0', TOKEN_DECIMALS);
    } catch (e) {
      return BigInt(0);
    }
  }, [sizeInput]);

  const signedSizeBigInt = React.useMemo(() => {
    return direction === 'Long' ? sizeBigInt : -sizeBigInt;
  }, [sizeBigInt, direction]);

  const {
    data: quoteSimulationResult,
    error: quoteError,
    isFetching: quoteLoading,
  } = useSimulateContract({
    address: marketAddress,
    abi: marketAbi,
    functionName: 'quoteCreateTraderPosition',
    args: [numericMarketId, signedSizeBigInt],
    chainId,
    account: accountAddress || zeroAddress,
    query: {
      enabled:
        isConnected &&
        !isChainMismatch &&
        !!marketAddress &&
        !!marketAbi &&
        sizeBigInt > BigInt(0),
    },
  });

  const [estimatedCollateralBI, quotedFillPriceBI] = React.useMemo(() => {
    const result = quoteSimulationResult?.result as
      | readonly [bigint, bigint]
      | undefined;

    if (!result || result.length < 2) {
      return [BigInt(0), BigInt(0)];
    }

    const requiredCollateral = result[0] ? BigInt(result[0]) : BigInt(0);
    const fillPrice = result[1] ? BigInt(result[1]) : BigInt(0);
    return [requiredCollateral, fillPrice];
  }, [quoteSimulationResult]);

  const estimatedCollateral = React.useMemo(() => {
    return formatUnits(estimatedCollateralBI, COLLATERAL_DECIMALS);
  }, [estimatedCollateralBI]);

  const estimatedFillPrice = React.useMemo(() => {
    return formatUnits(quotedFillPriceBI, TOKEN_DECIMALS);
  }, [quotedFillPriceBI]);

  const poolAddress = marketContractData?.pool as `0x${string}` | undefined;

  const { pool } = useUniswapPool(
    chainId ?? undefined,
    poolAddress ?? zeroAddress
  );

  const priceImpact: number = React.useMemo(() => {
    if (pool?.token0Price && quotedFillPriceBI > BigInt(0)) {
      try {
        const fillPrice = parseFloat(
          formatUnits(quotedFillPriceBI, TOKEN_DECIMALS)
        );
        const referencePrice = parseFloat(pool.token0Price.toSignificant(18));

        if (referencePrice === 0) return 0;

        return Math.abs((fillPrice / referencePrice - 1) * 100);
      } catch (e) {
        console.error('Error calculating price impact:', e);
        return 0;
      }
    }
    return 0;
  }, [quotedFillPriceBI, pool]);

  const showPriceImpactWarning = priceImpact > HIGH_PRICE_IMPACT;

  const {
    createTrade,
    isLoading: isCreatingTrade,
    isSuccess: isTradeCreated,
    isError: isTradeError,
    error: tradeError,
    txHash,
    isApproving,
    needsApproval,
  } = useCreateTrade({
    marketAddress,
    marketAbi,
    chainId,
    numericMarketId,
    size: signedSizeBigInt,
    collateralAmount: estimatedCollateral,
    slippagePercent: slippageAsNumber,
    enabled: isConnected && !isChainMismatch && !!marketAddress,
    collateralTokenAddress: collateralAssetAddress,
  });

  const [estimatedResultingBalance, setEstimatedResultingBalance] =
    useState(walletBalance);

  const successHandled = useRef(false);

  useEffect(() => {
    const costNum = parseFloat(estimatedCollateral || '0');
    const walletNum = parseFloat(walletBalance || '0');

    if (Number.isNaN(costNum) || Number.isNaN(walletNum)) {
      setEstimatedResultingBalance(walletBalance);
      return;
    }

    const newBalance = (walletNum - costNum).toFixed(COLLATERAL_DECIMALS);
    setEstimatedResultingBalance(newBalance >= '0' ? newBalance : '0');
  }, [estimatedCollateral, walletBalance]);

  useEffect(() => {
    if (isTradeCreated && txHash && onSuccess && !successHandled.current) {
      successHandled.current = true;

      toast({
        title: 'Trade Position Opened',
        description: 'Your trade position has been successfully opened!',
      });
      onSuccess(txHash);
      form.reset();
    }
  }, [isTradeCreated, txHash, onSuccess, toast, form]);

  // Reset the success handler when key inputs change
  useEffect(() => {
    successHandled.current = false;
  }, [sizeInput, direction]);

  useEffect(() => {
    if (isTradeError && tradeError) {
      toast({
        title: 'Error Opening Trade',
        description: tradeError.message || 'An unknown error occurred.',
        variant: 'destructive',
      });
    }
  }, [isTradeError, tradeError, switchChainError, toast]);

  const submitForm = async () => {
    if (!isConnected) {
      console.warn('Attempted to submit form while disconnected.');
      return;
    }

    if (isChainMismatch) {
      if (switchChain) {
        switchChain({ chainId });
      } else {
        toast({
          title: 'Error',
          description: 'Network switching is not available.',
          variant: 'destructive',
        });
      }
      return;
    }

    if (createTrade && typeof createTrade === 'function') {
      await createTrade();
    } else {
      console.error('createTrade function is not available');
      toast({
        title: 'Error',
        description: 'Unable to initiate trade creation.',
        variant: 'destructive',
      });
    }
  };

  const getButtonState = () => {
    if (!isConnected) {
      return { text: 'Connect Wallet', loading: false };
    }
    if (isPermitLoadingPermit) {
      return { text: 'Checking permissions...', loading: true };
    }
    if (permitData?.permitted === false) {
      return { text: 'Action Unavailable', loading: false };
    }
    if (isChainMismatch) {
      return { text: 'Switch Network', loading: isSwitchingChain };
    }
    if (isApproving) {
      return { text: `Approving ${collateralAssetTicker}...`, loading: true };
    }
    if (isCreatingTrade) {
      return { text: 'Opening Position...', loading: true };
    }
    if (needsApproval) {
      return {
        text: `Approve & Open ${baseTokenName} Position`,
        loading: false,
      };
    }
    return { text: `Open ${baseTokenName} Position`, loading: false };
  };

  const calculateIsSubmitDisabled = () => {
    return !!(
      !isConnected ||
      isPermitLoadingPermit ||
      permitData?.permitted === false ||
      isSwitchingChain ||
      isApproving ||
      isCreatingTrade ||
      quoteLoading ||
      !sizeBigInt ||
      sizeBigInt <= BigInt(0) ||
      !formState.isValid ||
      isTradeError ||
      quoteError
    );
  };

  const isSubmitDisabled = calculateIsSubmitDisabled();
  const buttonState = getButtonState();

  const handleDirectionChange = (value: string) => {
    setValue('direction', value as 'Long' | 'Short', { shouldValidate: true });
  };

  return (
    <TooltipProvider>
      <Form {...form}>
        <form onSubmit={handleSubmit(submitForm)} className="space-y-4">
          <Tabs
            defaultValue="Long"
            value={direction}
            onValueChange={handleDirectionChange}
            className="mb-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="Long">Long</TabsTrigger>
              <TabsTrigger value="Short">Short</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="mb-8">
            <FormField
              control={control}
              name="size"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Size</FormLabel>
                  <FormControl>
                    <div className="flex">
                      <Input
                        placeholder="0.0"
                        type="number"
                        step="any"
                        className="rounded-r-none"
                        {...field}
                      />
                      <div className="px-4 flex items-center border border-input bg-muted rounded-r-md ml-[-1px]">
                        {baseTokenName}
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="mb-8">
            <SlippageTolerance />
          </div>

          <AnimatePresence>
            {sizeBigInt > BigInt(0) && !quoteError && (
              <motion.div
                key="details-container"
                layout
                initial={{ opacity: 0, height: 0, transformOrigin: 'top' }}
                animate={{ opacity: 1, height: 'auto', transformOrigin: 'top' }}
                exit={{ opacity: 0, height: 0, transformOrigin: 'top' }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="mb-6 relative overflow-hidden"
              >
                <div
                  className={`transition-opacity duration-150 ${quoteLoading ? 'opacity-30' : 'opacity-100'}`}
                >
                  <h4 className="text-sm font-medium mb-2.5 flex items-center">
                    Order Quote
                  </h4>
                  <div className="flex flex-col gap-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size</span>
                      <span className="flex items-center">
                        <Badge
                          variant="outline"
                          className={`mr-2 px-1.5 py-0.5 text-xs font-medium ${
                            direction === 'Long'
                              ? 'border-green-500/40 bg-green-500/10 text-green-600'
                              : 'border-red-500/40 bg-red-500/10 text-red-600'
                          }`}
                        >
                          {direction}
                        </Badge>
                        <NumberDisplay value={sizeInput || '0'} />{' '}
                        <span className="ml-1">{baseTokenName}</span>
                      </span>
                    </div>

                    {estimatedCollateralBI > BigInt(0) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Position Collateral
                        </span>
                        <span>
                          0 → <NumberDisplay value={estimatedCollateral} />{' '}
                          {collateralAssetTicker}
                        </span>
                      </div>
                    )}

                    {quotedFillPriceBI > BigInt(0) && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-muted-foreground">
                          Estimated Fill Price
                        </span>
                        <span className="flex items-baseline">
                          <NumberDisplay value={estimatedFillPrice} />
                          {quoteTokenName}
                          {priceImpact > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span
                                  className={`ml-2 text-xs cursor-help ${showPriceImpactWarning ? 'text-red-500' : 'text-muted-foreground'}`}
                                >
                                  {Number(priceImpact.toFixed(2)).toString()}%
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p>
                                  This is the impact your order will make on the
                                  current market price.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </div>
                    )}

                    {isConnected && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Wallet Balance
                        </span>
                        <span>
                          <NumberDisplay value={walletBalance} /> →{' '}
                          <NumberDisplay value={estimatedResultingBalance} />{' '}
                          {collateralAssetTicker}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 space-y-2">
            {!isPermitLoadingPermit && permitData?.permitted === false && (
              <Alert
                variant="destructive"
                className="mb-4 bg-destructive/10 dark:bg-destructive/20 dark:text-red-700 rounded-sm"
              >
                <AlertTitle>Accessing Via Prohibited Region</AlertTitle>
                <AlertDescription>
                  You cannot trade using this app.
                </AlertDescription>
              </Alert>
            )}

            <div className="mt-0">
              {isConnected ? (
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={isSubmitDisabled}
                >
                  {buttonState.loading && (
                    <LottieLoader className="invert" width={20} height={20} />
                  )}
                  {buttonState.text}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  size="lg"
                  onClick={onConnectWallet}
                >
                  Connect Wallet
                </Button>
              )}
              {isConnected &&
                !isChainMismatch &&
                quoteError &&
                sizeBigInt > BigInt(0) && (
                  <p className="text-red-500 text-sm text-center mt-2 font-medium">
                    <AlertTriangle className="inline-block align-top w-4 h-4 mr-1 mt-0.5" />
                    Insufficient liquidity or error fetching quote. Try a
                    smaller size.
                  </p>
                )}
            </div>
          </div>
        </form>
      </Form>
    </TooltipProvider>
  );
}
