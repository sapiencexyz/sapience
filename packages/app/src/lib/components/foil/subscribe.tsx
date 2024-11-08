'use client';

/* eslint-disable sonarjs/cognitive-complexity */

import { formatDuration, intervalToDuration, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowUpDown,
  ChartNoAxesColumn,
  ChevronLeft,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FC, useState, useEffect, useContext, useMemo } from 'react';
import React from 'react';
import CountUp from 'react-countup';
import { useForm } from 'react-hook-form';
import type { AbiFunction } from 'viem';
import {
  decodeEventLog,
  formatUnits,
  zeroAddress,
  isAddress,
  createPublicClient,
  http,
} from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import {
  useWaitForTransactionReceipt,
  useWriteContract,
  useAccount,
  useReadContract,
  useSimulateContract,
  useChainId,
  useSwitchChain,
  useConnect,
} from 'wagmi';

import erc20ABI from '../../erc20abi.json';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useToast } from '~/hooks/use-toast';
import { useMarketList } from '~/lib/context/MarketListProvider';
import { MarketContext } from '~/lib/context/MarketProvider';

import NumberDisplay from './numberDisplay';
import SimpleBarChart from './SimpleBarChart';
import SizeInput from './sizeInput';

interface SubscribeProps {
  marketAddress?: string;
  chainId?: number;
  epoch?: number;
  showMarketSwitcher?: boolean;
}

const publicClient = createPublicClient({
  chain: mainnet,
  transport: process.env.NEXT_PUBLIC_INFURA_API_KEY
    ? http(
        `https://mainnet.infura.io/v3/${process.env.NEXT_PUBLIC_INFURA_API_KEY}`
      )
    : http('https://ethereum-rpc.publicnode.com'),
});

const Subscribe: FC<SubscribeProps> = ({
  marketAddress: propMarketAddress,
  chainId: propChainId,
  epoch: propEpoch,
  showMarketSwitcher = false,
}) => {
  // State declarations first
  const [sizeValue, setSizeValue] = useState<bigint>(BigInt(0));
  const [pendingTxn, setPendingTxn] = useState(false);
  const [collateralDelta, setCollateralDelta] = useState<bigint>(BigInt(0));
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [fillPrice, setFillPrice] = useState<bigint>(BigInt(0));
  const [fillPriceInEth, setFillPriceInEth] = useState<bigint>(BigInt(0));
  const [txnStep, setTxnStep] = useState(0);
  const [isMarketSelectorOpen, setIsMarketSelectorOpen] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [estimationResults, setEstimationResults] = useState<{
    totalGasUsed: number;
    ethPaid: number;
    avgGasPerTx: number;
    avgGasPrice: number;
    chartData: { timestamp: number; value: number }[];
  } | null>(null);

  // Form setup
  const form = useForm({
    defaultValues: {
      sizeInput: '0',
      walletAddress: '',
      slippage: '0.5',
    },
    mode: 'onChange',
    reValidateMode: 'onChange',
  });

  // Destructure form methods after initialization
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setValue,
    reset,
    watch,
  } = form;

  // Single definition of watched form values
  const formValues = {
    size: watch('sizeInput'),
    slippage: watch('slippage'),
  };

  // Rest of your hooks and effects
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { markets } = useMarketList();

  const marketAddress =
    propMarketAddress ||
    searchParams.get('marketAddress') ||
    markets.filter((m) => m.public)[0]?.address;
  const chainId =
    propChainId ||
    Number(searchParams.get('chainId')) ||
    markets.filter((m) => m.public)[0]?.chainId;
  const epoch = propEpoch || Number(searchParams.get('epoch')) || 1;

  const account = useAccount();
  const { isConnected, address } = account;
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { connect, connectors } = useConnect();

  const chainIdParam = useMemo(
    () => searchParams.get('chainId'),
    [searchParams]
  );
  const marketAddressParam = useMemo(
    () => searchParams.get('marketAddress'),
    [searchParams]
  );

  useEffect(() => {
    if (
      markets.filter((m) => m.public).length > 0 &&
      (!marketAddressParam || !chainIdParam) &&
      showMarketSwitcher
    ) {
      updateParams(
        markets.filter((m) => m.public)[0].address,
        markets.filter((m) => m.public)[0].chainId
      );
    }
  }, [markets, marketAddressParam, chainIdParam]);

  const updateParams = (address: string, chain: number) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    current.set('marketAddress', address);
    current.set('chainId', chain.toString());
    const search = current.toString();
    const query = search ? `?${search}` : '';
    router.push(`${window.location.pathname}${query}`);
  };

  const {
    address: contextMarketAddress,
    chainId: contextChainId,
    epoch: contextEpoch,
    collateralAsset,
    foilData,
    stEthPerToken,
    collateralAssetDecimals,
    collateralAssetTicker,
    refetchUniswapData,
    startTime,
    endTime,
  } = useContext(MarketContext);

  // Use prop values if provided, otherwise use context values
  const finalMarketAddress = marketAddress || contextMarketAddress;
  const finalChainId = chainId || contextChainId;
  const finalEpoch = epoch || contextEpoch;

  // Format start and end times
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return format(date, 'MMMM do');
  };

  // Allowance check
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    abi: erc20ABI,
    address: collateralAsset as `0x${string}`,
    functionName: 'allowance',
    args: [address, finalMarketAddress],
    chainId: finalChainId,
  });

  // Convert gas to gigagas for internal calculations
  const sizeInGigagas = sizeValue * BigInt(1e9);

  // Quote function
  const quoteCreatePositionResult = useSimulateContract({
    abi: foilData.abi,
    address: finalMarketAddress as `0x${string}`,
    functionName: 'quoteCreateTraderPosition',
    args: [finalEpoch, sizeInGigagas],
    chainId: finalChainId,
    account: address || zeroAddress,
    query: { enabled: sizeValue !== BigInt(0) },
  });

  // Update the useEffect to set quoteResult and fillPrice from the result
  useEffect(() => {
    if (quoteCreatePositionResult.data?.result !== undefined) {
      const [quoteResultData, fillPriceData] =
        quoteCreatePositionResult.data.result;
      setFillPrice(fillPriceData as bigint);
      setCollateralDelta(quoteResultData as bigint);
    } else {
      setFillPrice(BigInt(0));
      setCollateralDelta(BigInt(0));
    }
  }, [quoteCreatePositionResult.data]);

  useEffect(() => {
    if (quoteCreatePositionResult.error) {
      const errorMessage = quoteCreatePositionResult.error.message;
      // Clean up common error messages
      const cleanedMessage = errorMessage
        .replace('execution reverted: ', '')
        .replace('Error: ', '');
      setQuoteError(cleanedMessage);
    } else {
      setQuoteError(null);
    }
  }, [quoteCreatePositionResult.error, sizeValue]);

  const isLoadingCollateralChange = quoteCreatePositionResult.isFetching;

  // Write contract hooks
  const { data: hash, writeContract } = useWriteContract({
    mutation: {
      onError: (error) => {
        toast({
          variant: 'destructive',
          title: 'Transaction Failed',
          description: `There was an issue creating/updating your position: ${(error as Error).message}`,
        });
        resetAfterError();
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
        resetAfterError();
      },
      onSuccess: async () => {
        await refetchAllowance();
        toast({
          title: 'Approval Submitted',
          description: 'Waiting for confirmation...',
        });
      },
    },
  });

  const { isSuccess: isConfirmed, data: createTraderPositionReceipt } =
    useWaitForTransactionReceipt({ hash });
  const { isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  useEffect(() => {
    if (isConfirmed && txnStep === 2) {
      for (const log of createTraderPositionReceipt.logs) {
        try {
          const event = decodeEventLog({
            abi: foilData.abi,
            data: log.data,
            topics: log.topics,
          });

          if ((event as any).eventName === 'TraderPositionCreated') {
            const nftId = (event as any).args.positionId.toString();
            router.push(
              `/trade/${finalChainId}:${finalMarketAddress}/epochs/${finalEpoch}?positionId=${nftId}`
            );
            toast({
              title: 'Position Created',
              description: `Your subscription has been created as position ID: ${nftId}`,
            });
            resetAfterSuccess();
            return;
          }
        } catch (error) {
          // This log was not for the TraderPositionCreated event, continue to next log
        }
      }
      // If we get here, no position ID was found but transaction succeeded
      toast({
        title: 'Success',
        description: 'Your subscription has been created successfully.',
      });
      resetAfterSuccess();
    }
  }, [isConfirmed, createTraderPositionReceipt, txnStep]);

  useEffect(() => {
    if (approveSuccess && txnStep === 1) {
      handleCreateTraderPosition();
    }
  }, [approveSuccess, txnStep]);

  useEffect(() => {
    if (fillPrice !== BigInt(0) && stEthPerToken) {
      const fillPriceInGwei =
        (fillPrice * BigInt(1e18)) /
        BigInt(stEthPerToken * 10 ** collateralAssetDecimals);
      setFillPriceInEth(fillPriceInGwei);
    } else {
      setFillPriceInEth(BigInt(0));
    }
  }, [fillPrice, collateralAssetDecimals, stEthPerToken]);

  // Update onSubmit to check for dialog interactions
  const onSubmit = async (values: any) => {
    // Return early if we're just opening/closing dialogs
    if (isMarketSelectorOpen || isAnalyticsOpen) {
      return;
    }

    if (BigInt(formValues.size) === BigInt(0)) {
      toast({
        title: 'Invalid size',
        description: 'Please enter a positive gas amount.',
        variant: 'destructive',
      });
      return;
    }
    setPendingTxn(true);

    if (requireApproval) {
      approveWrite({
        abi: erc20ABI as AbiFunction[],
        address: collateralAsset as `0x${string}`,
        functionName: 'approve',
        args: [finalMarketAddress, collateralDeltaLimit],
      });
      setTxnStep(1);
    } else {
      handleCreateTraderPosition();
    }
  };

  const handleCreateTraderPosition = () => {
    const sizeInTokens = sizeInGigagas;
    // Set deadline to 30 minutes from now
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);
    const absCollateralDeltaLimit =
      collateralDeltaLimit < BigInt(0)
        ? -collateralDeltaLimit
        : collateralDeltaLimit;
    writeContract({
      abi: foilData.abi,
      address: finalMarketAddress as `0x${string}`,
      functionName: 'createTraderPosition',
      args: [finalEpoch, sizeInTokens, absCollateralDeltaLimit, deadline],
    });
    setTxnStep(2);
  };

  const resetAfterError = () => {
    setPendingTxn(false);
    setTxnStep(0);
  };

  const resetAfterSuccess = () => {
    reset({
      sizeInput: '0',
      walletAddress: '',
      slippage: '0.5',
    });
    setSizeValue(BigInt(0));
    setPendingTxn(false);
    setTxnStep(0);
    refetchUniswapData();
  };

  const renderActionButton = () => {
    if (!isConnected) {
      return (
        <Button
          className="w-full"
          size="lg"
          onClick={() => connect({ connector: connectors[0] })}
        >
          Connect Wallet
        </Button>
      );
    }

    if (currentChainId !== finalChainId) {
      return (
        <Button
          className="w-full"
          size="lg"
          onClick={() => switchChain({ chainId: finalChainId })}
        >
          Switch Network
        </Button>
      );
    }

    const isDisabled =
      pendingTxn ||
      Boolean(quoteError) ||
      BigInt(formValues.size) <= BigInt(0) ||
      isLoadingCollateralChange;

    return (
      <div className="relative">
        {isLoadingCollateralChange && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        )}
        <Button
          className="w-full"
          size="lg"
          type="submit"
          disabled={isDisabled}
        >
          {requireApproval
            ? `Approve ${collateralAssetTicker} Transfer`
            : 'Create Subscription'}
        </Button>
      </div>
    );
  };

  const marketName =
    markets.find((m) => m.address === marketAddress)?.name || 'Choose Market';

  const handleEstimateUsage = async () => {
    const formWalletAddress = form.getValues('walletAddress');
    if (!formWalletAddress) {
      toast({
        title: 'Invalid Address',
        description: 'Please enter a wallet address or ENS name.',
        duration: 3000,
      });
      return;
    }

    setIsEstimating(true);
    try {
      let resolvedAddress = formWalletAddress;
      if (!isAddress(formWalletAddress)) {
        try {
          const ensAddress = await publicClient.getEnsAddress({
            name: formWalletAddress,
          });
          if (!ensAddress) {
            throw new Error('Could not resolve ENS name');
          }
          resolvedAddress = ensAddress;
        } catch (error) {
          toast({
            title: 'Invalid Address',
            description: 'Please enter a valid wallet address or ENS name.',
            duration: 3000,
          });
          setIsEstimating(false);
          return;
        }
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_FOIL_API_URL}/estimate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: resolvedAddress,
            chainId: finalChainId,
            marketAddress: finalMarketAddress,
            epochId: finalEpoch,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch estimate');
      }

      const data = await response.json();

      // Add check for no gas usage
      if (!data.totalGasUsed || data.totalGasUsed === 0) {
        toast({
          title: 'Recent Data Unavailable',
          description: `This address hasn't used gas in the last ${formattedDuration}.`,
          duration: 5000,
        });
        return;
      }

      // Store the results if there is gas usage
      setEstimationResults({
        totalGasUsed: data.totalGasUsed,
        ethPaid: data.ethPaid || 0,
        avgGasPerTx: data.avgGasPerTx || 0,
        avgGasPrice: data.avgGasPrice || 0,
        chartData: data.chartData || [],
      });
    } catch (error) {
      toast({
        title: 'Estimation Failed',
        description: 'Unable to estimate gas usage. Please try again.',
        duration: 5000,
      });
    } finally {
      setIsEstimating(false);
    }
  };

  const formattedStartTime = startTime ? formatDate(Number(startTime)) : '';
  const formattedEndTime = endTime ? formatDate(Number(endTime)) : '';

  // Add this new formatted duration calculation
  const formattedDuration = useMemo(() => {
    if (!startTime || !endTime) return '';

    const duration = intervalToDuration({
      start: new Date(Number(startTime) * 1000),
      end: new Date(Number(endTime) * 1000),
    });

    return formatDuration(duration, { format: ['months', 'days'] });
  }, [startTime, endTime]);

  // Now we can define collateralDeltaLimit after allowance is initialized
  const collateralDeltaLimit = useMemo(() => {
    if (collateralDelta === BigInt(0)) return BigInt(0);

    // Fixed 1% slippage
    const slippageMultiplier = BigInt(101 * 100); // 1% above
    const slippageReductionMultiplier = BigInt(99 * 100); // 1% below

    if (collateralDelta > BigInt(0)) {
      return (collateralDelta * slippageMultiplier) / BigInt(10000);
    }
    return (collateralDelta * slippageReductionMultiplier) / BigInt(10000);
  }, [collateralDelta]);

  // And now we can use requireApproval
  const requireApproval =
    !allowance || collateralDeltaLimit > (allowance as bigint);

  const handleMarketSelect = (address: string, chain: number) => {
    updateParams(address, chain);
    setIsMarketSelectorOpen(false);
  };

  const getChainName = (chainId: number) => {
    switch (chainId) {
      case mainnet.id:
        return 'Ethereum';
      case sepolia.id:
        return 'Sepolia';
      default:
        return `Chain ${chainId}`;
    }
  };

  useEffect(() => {
    if (!isAnalyticsOpen) {
      setEstimationResults(null);
      form.setValue('walletAddress', '');
    }
  }, [isAnalyticsOpen]);

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex items-center mb-5">
          <div className="border border-border rounded-full p-1.5 mr-2 h-8 w-8 overflow-hidden">
            <img src="/eth.svg" alt="Ethereum" width="100%" height="100%" />
          </div>

          <h2 className="text-lg md:text-2xl font-semibold">
            {marketName} Subscription
          </h2>

          {showMarketSwitcher && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsMarketSelectorOpen(true)}
              className="px-2.5 ml-auto text-muted-foreground"
            >
              <ArrowUpDown />
            </Button>
          )}
        </div>

        <div className="flex items-center flex-col mb-6">
          <p className="mb-6">
            Enter the amount of gas you expect to use between{' '}
            {formattedStartTime} and {formattedEndTime}.
          </p>

          <Button
            variant="outline"
            onClick={() => setIsAnalyticsOpen(true)}
            className="w-full shadow-sm"
          >
            <ChartNoAxesColumn className="text-muted-foreground" />
            Wallet Analytics
          </Button>
        </div>

        <Dialog open={isAnalyticsOpen} onOpenChange={setIsAnalyticsOpen}>
          <DialogContent className="max-w-96 overflow-hidden focus:ring-0 focus:outline-none">
            <DialogHeader className="relative">
              <AnimatePresence mode="wait">
                {estimationResults ? (
                  <motion.div
                    key="back-button"
                    initial={{ opacity: 0, x: 32 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 32 }}
                    transition={{
                      duration: 0.3,
                      ease: 'easeInOut',
                    }}
                    className="absolute left-0 -top-1.5 -left-1.5"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEstimationResults(null)}
                      className="p-0 h-auto text-muted-foreground"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="sr-only">Go back</span>
                    </Button>
                  </motion.div>
                ) : null}
              </AnimatePresence>

              <DialogTitle className="tracking-normal text-center pt-3">
                Estimate Gas Usage
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 pt-1">
              <AnimatePresence mode="wait">
                {!estimationResults ? (
                  <motion.div
                    key="input-form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{
                      duration: 0.2,
                      ease: 'easeInOut',
                    }}
                  >
                    <FormField
                      control={form.control}
                      name="walletAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Wallet Address</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="vitalik.eth"
                              autoComplete="off"
                              spellCheck={false}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleEstimateUsage();
                                }
                              }}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <Button
                      size="lg"
                      className="w-full mt-5"
                      onClick={handleEstimateUsage}
                      disabled={isEstimating}
                    >
                      {isEstimating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Generating
                        </>
                      ) : (
                        'Generate Analytics'
                      )}
                    </Button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="results"
                    initial={{ opacity: 0, height: 140 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 140 }}
                    transition={{
                      duration: 0.2,
                      height: {
                        duration: 0.5,
                        ease: 'easeOut',
                      },
                      opacity: {
                        duration: 0.2,
                        ease: 'easeOut',
                      },
                    }}
                  >
                    <div className="mb-5">
                      <SimpleBarChart data={estimationResults.chartData} />
                    </div>
                    <p className="text-lg mb-2">
                      {form.getValues('walletAddress')} used{' '}
                      <CountUp
                        end={estimationResults.totalGasUsed}
                        separator=","
                        duration={1.5}
                      />{' '}
                      gas (costing{' '}
                      <NumberDisplay value={estimationResults.ethPaid} /> ETH)
                      over the last {formattedDuration}.
                    </p>
                    <div className="flex flex-col gap-0.5 mb-6">
                      <p className="text-sm text-muted-foreground">
                        The average cost per transaction was{' '}
                        {estimationResults.avgGasPerTx.toLocaleString()} gas.
                      </p>
                      <p className="text-sm text-muted-foreground">
                        The average gas price paid was{' '}
                        {estimationResults.avgGasPrice.toLocaleString()} gwei.
                      </p>
                    </div>
                    <div className="border border-border p-6 rounded-lg shadow-sm bg-primary/5">
                      <p className="mb-4">
                        Generate a quote for a subscription of this much gas
                        over {formattedDuration}, starting on{' '}
                        {formattedStartTime}.
                      </p>
                      <Button
                        className="w-full"
                        size="lg"
                        variant="default"
                        onClick={() => {
                          setSizeValue(BigInt(estimationResults.totalGasUsed));
                          setIsAnalyticsOpen(false);
                        }}
                      >
                        Generate Quote
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </DialogContent>
        </Dialog>

        <FormField
          control={form.control}
          name="sizeInput"
          render={({ field }) => (
            <>
              <SizeInput
                setSize={setSizeValue}
                size={sizeValue}
                label="Gas Amount"
                {...field}
              />
              <p className="text-sm text-muted-foreground mt-2">
                If the average gas price exceeds the quote during the period,
                you can redeem a rebate.
              </p>
            </>
          )}
        />

        <div className=" bg-muted p-4 rounded-lg space-y-2 my-7">
          <p className="text-sm font-semibold text-muted-foreground">Quote</p>
          {quoteError ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <p className="text-red-500 text-sm font-medium flex items-center pt-1">
                    <span className="mr-1">
                      Foil was unable to generate a quote.
                    </span>{' '}
                    <HelpCircle className="h-4 w-4" />
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{quoteError}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <div className="flex gap-3 items-baseline">
              <AnimatePresence mode="wait">
                {isLoadingCollateralChange ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center justify-center mx-auto -translate-y-1"
                  >
                    <Loader2 className="h-7 w-7 animate-spin opacity-50" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex gap-3 items-baseline">
                      <p className="text-lg">
                        <NumberDisplay
                          value={formatUnits(
                            collateralDelta,
                            collateralAssetDecimals
                          )}
                        />{' '}
                        {collateralAssetTicker}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <NumberDisplay value={formatUnits(fillPriceInEth, 9)} />{' '}
                        gwei
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {renderActionButton()}

        <Dialog
          open={isMarketSelectorOpen}
          onOpenChange={setIsMarketSelectorOpen}
        >
          <DialogContent className="max-w-96 overflow-hidden">
            <DialogHeader>
              <DialogTitle>Select Market</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {markets
                .filter((m) => m.public)
                .map((market) => (
                  <button
                    type="button"
                    key={market.id}
                    className={`w-full flex justify-between items-center p-3 rounded-lg hover:bg-muted transition-colors ${
                      market.address === marketAddress ? 'bg-muted' : ''
                    }`}
                    onClick={() =>
                      handleMarketSelect(market.address, market.chainId)
                    }
                  >
                    <span className="font-medium">{market.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {getChainName(market.chainId)}
                    </span>
                  </button>
                ))}
            </div>
          </DialogContent>
        </Dialog>
      </form>
    </Form>
  );
};

export default Subscribe;
