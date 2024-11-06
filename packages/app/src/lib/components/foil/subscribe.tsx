'use client';

import { formatDuration, intervalToDuration } from 'date-fns';
import { ArrowUpDown, HelpCircle, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type FC,
  type FormEvent,
  useState,
  useEffect,
  useContext,
  useRef,
  useMemo,
} from 'react';
import React from 'react';
import { useForm } from 'react-hook-form';
import type { AbiFunction, WriteContractErrorType } from 'viem';
import { decodeEventLog, formatUnits, zeroAddress } from 'viem';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
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
import { getChain } from '~/lib/util/util';

import NumberDisplay from './numberDisplay';
import SizeInput from './sizeInput';

interface SubscribeProps {
  marketAddress?: string;
  chainId?: number;
  epoch?: number;
  showMarketSwitcher?: boolean;
}

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
  const [walletAddressInput, setWalletAddressInput] = useState<string>('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [accordionIndex, setAccordionIndex] = useState<string | undefined>(
    undefined
  );

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
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
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

  // Update onSubmit to use the single formValues definition
  const onSubmit = async (values: any) => {
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
      isLoadingCollateralChange ||
      Boolean(quoteError) ||
      BigInt(formValues.size) <= BigInt(0);

    return (
      <Button className="w-full" size="lg" type="submit" disabled={isDisabled}>
        {(() => {
          if (isLoadingCollateralChange) {
            return (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading Quote</span>
              </>
            );
          }

          if (requireApproval) {
            return `Approve ${collateralAssetTicker} Transfer`;
          }

          return 'Create Subscription';
        })()}
      </Button>
    );
  };

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  const marketName =
    markets.find((m) => m.address === marketAddress)?.name || 'Choose Market';

  useEffect(() => {
    if (address) {
      setWalletAddressInput(address);
    }
  }, [address]);

  const handleEstimateUsage = async () => {
    if (!walletAddressInput) {
      toast({
        title: 'Invalid Address',
        description: 'Please enter a wallet address to estimate usage.',
        duration: 3000,
      });
      return;
    }

    setIsEstimating(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_FOIL_API_URL}/estimate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            walletAddress: walletAddressInput,
            chainId: finalChainId,
            marketAddress: finalMarketAddress,
            epochId: finalEpoch,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch estimate');
      }

      const duration = formatDuration(
        intervalToDuration({
          start: Number(startTime) * 1000,
          end: Number(endTime) * 1000,
        })
      );
      const data = await response.json();
      setSizeValue(BigInt(Math.floor(data.totalGasUsed)));
      setAccordionIndex(undefined);
      if (sizeValue === BigInt(0)) {
        toast({
          title: 'Estimate Complete',
          description: `This wallet hasn't used any gas in the last ${duration}.`,
          duration: 5000,
        });
      } else {
        toast({
          title: 'Estimate Complete',
          description: `Gas amount has been populated based on this wallet's usage in the last ${duration}.`,
          duration: 5000,
        });
      }
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

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{marketName} Subscription</h2>
          {showMarketSwitcher && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsMarketSelectorOpen(true)}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <p>
                Enter the amount of gas you expect to use between{' '}
                {formattedStartTime} and {formattedEndTime}.
                <TooltipTrigger asChild>
                  <HelpCircle className="inline-block h-4 w-4 text-muted-foreground ml-1 relative top-[-3px]" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>
                    If the average gas price in this time exceeds the quote
                    you&apos;re provided in gwei, you will be able to redeem a
                    rebate from Foil at the end of this period.
                  </p>
                </TooltipContent>
              </p>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Accordion
          type="single"
          collapsible
          value={accordionIndex}
          onValueChange={(val) => setAccordionIndex(val)}
        >
          <AccordionItem value="0" className="border-none">
            <AccordionTrigger className="text-sm uppercase font-medium text-muted-foreground">
              Estimate Gas Usage
            </AccordionTrigger>
            <AccordionContent>
              <div className="border p-6 rounded-sm space-y-4">
                <FormField
                  control={form.control}
                  name="walletAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Wallet Address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          disabled={isEstimating}
                          placeholder="0x..."
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button
                  className="w-full"
                  onClick={handleEstimateUsage}
                  disabled={isEstimating}
                >
                  {isEstimating ? 'Estimating...' : 'Estimate Usage'}
                </Button>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

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
              {quoteError && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <p className="text-red-500 text-sm font-medium flex items-center">
                        <span className="mr-2">
                          Foil was unable to generate a quote
                        </span>{' '}
                        <HelpCircle className="h-4 w-4" />
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-xs">{quoteError}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
        />

        {!quoteError && (
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <p className="text-sm font-semibold text-muted-foreground">Quote</p>

            <div className="flex items-center gap-3">
              <p className="text-lg">
                <NumberDisplay
                  value={formatUnits(collateralDelta, collateralAssetDecimals)}
                />{' '}
                {collateralAssetTicker}
              </p>
              <p className="text-sm text-muted-foreground">
                <NumberDisplay value={formatUnits(fillPriceInEth, 9)} /> gwei
              </p>
            </div>
          </div>
        )}

        {renderActionButton()}

        <Dialog
          open={isMarketSelectorOpen}
          onOpenChange={setIsMarketSelectorOpen}
        >
          <DialogContent>
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
