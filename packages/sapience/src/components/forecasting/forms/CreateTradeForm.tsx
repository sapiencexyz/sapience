import { NumberDisplay } from '@foil/ui/components/NumberDisplay';
import { SlippageTolerance } from '@foil/ui/components/SlippageTolerance';
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
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { formatUnits, parseUnits, zeroAddress } from 'viem';
import { useAccount, useSimulateContract } from 'wagmi';

import LottieLoader from '~/components/shared/LottieLoader';
import { useUniswapPool } from '~/hooks/charts/useUniswapPool';
import { useCreateTrade } from '~/hooks/contract/useCreateTrade';
import { useTokenBalance } from '~/hooks/contract/useTokenBalance';
import { useTradeForm } from '~/hooks/forms/useTradeForm';
import { TOKEN_DECIMALS, HIGH_PRICE_IMPACT } from '~/lib/constants/numbers';
import { useForecast } from '~/lib/context/ForecastProvider';

const COLLATERAL_DECIMALS = TOKEN_DECIMALS;

export type TradeFormMarketDetails = {
  marketAddress: `0x${string}`;
  chainId: number;
  numericMarketId: number;
  marketAbi: any; // Consider using specific ABI type if available
  collateralAssetTicker: string;
  collateralAssetAddress?: `0x${string}`;
  // Add any other market-specific details needed for trading
};

export interface TradeFormProps {
  marketDetails: TradeFormMarketDetails;
  isConnected?: boolean;
  onConnectWallet?: () => void;
  onSuccess?: (txHash: `0x${string}`) => void;
}

export function CreateTradeForm({
  marketDetails,
  isConnected = false,
  onConnectWallet,
  onSuccess,
}: TradeFormProps) {
  const { toast } = useToast();
  const { baseTokenName, marketContractData, quoteTokenName } = useForecast();
  const { address: accountAddress } = useAccount();

  const {
    marketAddress,
    chainId,
    marketAbi,
    collateralAssetTicker,
    collateralAssetAddress,
    numericMarketId,
  } = marketDetails;

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
      enabled: !!marketAddress && !!marketAbi && sizeBigInt > BigInt(0),
    },
  });

  const [estimatedCollateralBI, quotedFillPriceBI] = React.useMemo(() => {
    const result = quoteSimulationResult?.result;
    if (!result || !Array.isArray(result)) {
      return [BigInt(0), BigInt(0)];
    }
    const requiredCollateral = result[0]
      ? BigInt(result[0].toString())
      : BigInt(0);
    const fillPrice = result[1] ? BigInt(result[1].toString()) : BigInt(0);
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
    size: signedSizeBigInt,
    collateralAmount: estimatedCollateral,
    slippagePercent: slippageAsNumber,
    enabled: isConnected && !!marketAddress,
    collateralTokenAddress: collateralAssetAddress,
  });

  const [estimatedResultingBalance, setEstimatedResultingBalance] =
    useState(walletBalance);

  useEffect(() => {
    const costNum = parseFloat(estimatedCollateral || '0');
    const walletNum = parseFloat(walletBalance || '0');

    if (isNaN(costNum) || isNaN(walletNum)) {
      setEstimatedResultingBalance(walletBalance);
      return;
    }

    const newBalance = (walletNum - costNum).toFixed(COLLATERAL_DECIMALS);
    setEstimatedResultingBalance(newBalance >= '0' ? newBalance : '0');
  }, [estimatedCollateral, walletBalance]);

  useEffect(() => {
    if (isTradeCreated && txHash && onSuccess) {
      toast({
        title: 'Trade Position Opened',
        description: 'Your trade position has been successfully opened!',
      });
      onSuccess(txHash);
      form.reset();
    }
  }, [isTradeCreated, txHash, onSuccess, toast, form]);

  useEffect(() => {
    if (isTradeError && tradeError) {
      toast({
        title: 'Error Opening Trade',
        description: tradeError.message || 'An unknown error occurred.',
        variant: 'destructive',
      });
    }
  }, [isTradeError, tradeError, toast]);

  const submitForm = async () => {
    await createTrade();
  };

  const getButtonState = () => {
    if (!isConnected) {
      return { text: 'Connect Wallet', loading: false };
    }
    if (quoteLoading && sizeBigInt > BigInt(0)) {
      return { text: 'Generating Quote...', loading: true };
    }
    if (isApproving) {
      return { text: `Approving ${collateralAssetTicker}...`, loading: true };
    }
    if (isCreatingTrade) {
      return { text: 'Opening Position...', loading: true };
    }
    if (needsApproval && estimatedCollateralBI > BigInt(0)) {
      return { text: `Approve & Open ${direction}`, loading: false };
    }
    // Default case (needsApproval false or estimatedCollateralBI <= 0, or already approved)
    return { text: `Open ${direction}`, loading: false };
  };

  const calculateIsSubmitDisabled = () => {
    if (!isConnected) return true; // Explicitly disable if not connected, though button changes
    if (quoteLoading && sizeBigInt > BigInt(0)) return true;
    if (isCreatingTrade) return true;
    if (isApproving) return true;
    if (sizeBigInt === BigInt(0)) return true;
    if (!formState.isValid) return true;
    // Disable if quote is required but not available or errored
    if (sizeBigInt > BigInt(0)) {
      if (estimatedCollateralBI <= BigInt(0) && !quoteError) return true; // Quote needed but not ready
      if (quoteError) return true; // Quote resulted in error
    }
    return false;
  };

  const buttonState = getButtonState();
  const isSubmitDisabled = calculateIsSubmitDisabled();

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

          {/* Moved Order Quote Section */}
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

                <AnimatePresence>
                  {quoteLoading && (
                    <motion.div
                      key="quote-loader"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <LottieLoader className="invert" width={30} height={30} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Button Section */}
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
            {quoteError && sizeBigInt > BigInt(0) && (
              <p className="text-red-500 text-sm text-center mt-2 font-medium">
                <AlertTriangle className="inline-block align-top w-4 h-4 mr-1 mt-0.5" />
                Insufficient liquidity. Try a smaller size.
              </p>
            )}
          </div>
        </form>
      </Form>
    </TooltipProvider>
  );
}
