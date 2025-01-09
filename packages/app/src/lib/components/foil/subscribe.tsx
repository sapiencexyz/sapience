'use client';

/* eslint-disable sonarjs/cognitive-complexity */

import { formatDuration, intervalToDuration, format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Loader2, Info, BookTextIcon } from 'lucide-react';
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
import { mainnet } from 'viem/chains';
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
import { Alert, AlertTitle, AlertDescription } from '~/components/ui/alert';
import { Button } from '~/components/ui/button';
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

const TOAST_DURATION = 3000;
const LONG_TOAST_DURATION = 5000;
const WAITING_MESSAGE = 'Waiting for confirmation...';

interface PositionData {
  vGasAmount: bigint;
  borrowedVGas: bigint;
  depositedCollateralAmount: bigint;
}

interface SubscribeProps {
  onAnalyticsClose?: (size: bigint) => void;
  isAnalyticsMode?: boolean;
  initialSize?: bigint | null;
  positionId?: number;
  onClose?: () => void;
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
  onAnalyticsClose,
  isAnalyticsMode = false,
  initialSize = null,
  positionId,
  onClose,
}) => {
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
  const finalMarketAddress = contextMarketAddress;
  const finalChainId = contextChainId;
  const finalEpoch = contextEpoch;

  // State declarations first
  const [sizeValue, setSizeValue] = useState<bigint>(initialSize || BigInt(0));
  const [pendingTxn, setPendingTxn] = useState(false);
  const [collateralDelta, setCollateralDelta] = useState<bigint>(BigInt(0));
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [fillPrice, setFillPrice] = useState<bigint>(BigInt(0));
  const [fillPriceInEth, setFillPriceInEth] = useState<bigint>(BigInt(0));
  const [txnStep, setTxnStep] = useState(0);
  const [isMarketSelectorOpen, setIsMarketSelectorOpen] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [withdrawableCollateral, setWithdrawableCollateral] = useState<bigint>(
    BigInt(0)
  );
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

  // Rest of your hooks and effects
  const { toast } = useToast();
  const { markets } = useMarketList();

  const account = useAccount();
  const { isConnected, address } = account;
  const currentChainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { connect, connectors } = useConnect();

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
    args: [finalEpoch || 0, sizeInGigagas],
    chainId: finalChainId,
    account: address || zeroAddress,
    query: { enabled: sizeValue !== BigInt(0) },
  });

  // Position data
  const { data: positionData } = useReadContract({
    abi: foilData.abi,
    address: finalMarketAddress as `0x${string}`,
    functionName: 'getPosition',
    args: positionId !== undefined ? [positionId] : undefined,
    chainId: finalChainId,
    query: {
      enabled: !!positionId,
    },
  }) as { data: PositionData };

  // Quote modify position for closing
  const quoteModifyPositionResult = useSimulateContract({
    abi: foilData.abi,
    address: finalMarketAddress as `0x${string}`,
    functionName: 'quoteModifyTraderPosition',
    args: positionId !== undefined ? [positionId, BigInt(0)] : undefined,
    chainId: finalChainId,
    account: address || zeroAddress,
    query: { enabled: !!positionId },
  });

  // Update the useEffect to set quoteResult and fillPrice from the result
  useEffect(() => {
    if (positionId) {
      if (quoteModifyPositionResult.data?.result !== undefined) {
        const [expectedCollateralDelta, closePnLValue, fillPriceData] =
          quoteModifyPositionResult.data.result;
        setFillPrice(fillPriceData as bigint);
        setCollateralDelta(expectedCollateralDelta as bigint);
      }
    } else if (quoteCreatePositionResult.data?.result !== undefined) {
      const [quoteResultData, fillPriceData] =
        quoteCreatePositionResult.data.result;
      setFillPrice(fillPriceData as bigint);
      setCollateralDelta(quoteResultData as bigint);
    } else {
      setFillPrice(BigInt(0));
      setCollateralDelta(BigInt(0));
    }
  }, [
    quoteCreatePositionResult.data,
    quoteModifyPositionResult.data,
    positionId,
  ]);

  useEffect(() => {
    if (positionId && quoteModifyPositionResult?.error) {
      setQuoteError(quoteModifyPositionResult.error.message);
    } else if (quoteCreatePositionResult.error && !positionId) {
      const errorMessage = quoteCreatePositionResult.error.message;
      // Clean up common error messages
      const cleanedMessage = errorMessage
        .replace('execution reverted: ', '')
        .replace('Error: ', '');
      setQuoteError(cleanedMessage);
    } else {
      setQuoteError(null);
    }
  }, [
    quoteCreatePositionResult.error,
    quoteModifyPositionResult?.error,
    sizeValue,
    positionId,
  ]);

  const isLoadingCollateralChange = positionId
    ? quoteModifyPositionResult.isFetching
    : quoteCreatePositionResult.isFetching;

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
          description: WAITING_MESSAGE,
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
      onSuccess: () => {
        toast({
          title: 'Approval Submitted',
          description: WAITING_MESSAGE,
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
      if (positionId) {
        toast({
          title: 'Success',
          description:
            endTime && Date.now() / 1000 > Number(endTime)
              ? 'Position settled successfully!'
              : 'Position closed successfully!',
        });
        onClose?.();
      } else {
        for (const log of createTraderPositionReceipt.logs) {
          try {
            const event = decodeEventLog({
              abi: foilData.abi,
              data: log.data,
              topics: log.topics,
            });

            if ((event as any).eventName === 'TraderPositionCreated') {
              const nftId = (event as any).args.positionId.toString();
              toast({
                title: 'Subscription Created',
                description: `Your subscription has been created as position ${nftId}`,
              });
              resetAfterSuccess();
              onClose?.();
              return;
            }
          } catch (error) {
            // This log was not for the TraderPositionCreated event, continue to next log
          }
        }
        toast({
          title: 'Success',
          description: "We've created your subscription for you.",
        });
        resetAfterSuccess();
        onClose?.();
      }
    }
  }, [isConfirmed, createTraderPositionReceipt, txnStep, positionId, endTime]);

  useEffect(() => {
    if (approveSuccess && txnStep === 1) {
      refetchAllowance();
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
    // Return early if we're just opening/closing dialogs or not connected
    if (isMarketSelectorOpen || !isConnected) {
      return;
    }

    if (sizeValue === BigInt(0)) {
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
      args: [finalEpoch || 0, sizeInTokens, absCollateralDeltaLimit, deadline],
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
    refetchAllowance();
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
      sizeValue <= BigInt(0) ||
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
    markets.find((m) => m.address === finalMarketAddress)?.name ||
    'Choose Market';

  const handleEstimateUsage = async () => {
    const formWalletAddress = form.getValues('walletAddress');
    if (!formWalletAddress) {
      toast({
        title: 'Invalid Address',
        description: 'Please enter a wallet address or ENS name.',
        duration: TOAST_DURATION,
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
            duration: TOAST_DURATION,
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
          duration: LONG_TOAST_DURATION,
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
        duration: LONG_TOAST_DURATION,
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

  useEffect(() => {
    if (initialSize) {
      setSizeValue(initialSize);
      form.setValue('sizeInput', initialSize.toString());
    }
  }, [initialSize]);

  const handleClosePosition = async () => {
    if (!positionId || !isConnected) return;

    setPendingTxn(true);

    try {
      if (endTime && Date.now() / 1000 > Number(endTime)) {
        // Use settlePosition if past end time
        writeContract({
          abi: foilData.abi,
          address: finalMarketAddress as `0x${string}`,
          functionName: 'settlePosition',
          chainId: finalChainId,
          args: [BigInt(positionId)],
        });
      } else {
        // Use modifyTraderPosition for early close
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

        // Get the current position size first
        let currentSize = BigInt(0);
        if (positionData) {
          currentSize =
            positionData.vGasAmount > BigInt(0)
              ? positionData.vGasAmount
              : -positionData.borrowedVGas;
        }

        // Calculate the delta size (will be negative of current size)
        const deltaSize = BigInt(0) - currentSize;

        if (deltaSize === BigInt(0)) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Position is already closed',
          });
          setPendingTxn(false);
          return;
        }

        // Use absolute value of collateralDelta and add some buffer for slippage
        const absCollateralDeltaLimit =
          collateralDelta < BigInt(0) ? -collateralDelta : collateralDelta;

        const collateralDeltaWithBuffer =
          (absCollateralDeltaLimit * BigInt(99)) / BigInt(100); // 1% slippage buffer

        writeContract({
          abi: foilData.abi,
          address: finalMarketAddress as `0x${string}`,
          functionName: 'modifyTraderPosition',
          args: [positionId, BigInt(0), collateralDeltaWithBuffer, deadline],
        });
      }
      setTxnStep(2);
      toast({
        title: 'Transaction Submitted',
        description: WAITING_MESSAGE,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: `Failed to close position: ${(error as Error).message}`,
      });
      setPendingTxn(false);
    }
  };

  // Add effect to update withdrawableCollateral when positionData changes
  useEffect(() => {
    if (positionData) {
      setWithdrawableCollateral(
        BigInt((positionData as any).depositedCollateralAmount)
      );
    }
  }, [positionData]);

  if (!finalEpoch) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <h2 className="text-lg font-medium">Loading...</h2>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <h2 className="text-lg font-medium">Connect your wallet</h2>
        <p className="text-sm text-muted-foreground">
          Connect your wallet to view and manage subscriptions
        </p>
      </div>
    );
  }

  if (isAnalyticsMode) {
    return (
      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
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
                  {form.getValues('walletAddress').endsWith('.eth')
                    ? form.getValues('walletAddress')
                    : `${form.getValues('walletAddress').slice(0, 6)}...${form.getValues('walletAddress').slice(-4)}`}{' '}
                  used{' '}
                  <CountUp
                    end={estimationResults.totalGasUsed}
                    separator=","
                    duration={1.5}
                  />{' '}
                  gas (costing{' '}
                  <NumberDisplay value={estimationResults.ethPaid} /> ETH) over
                  the last {formattedDuration}.
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
                    Generate a quote for a subscription of this much gas over{' '}
                    {formattedDuration}, starting on {formattedStartTime}.
                  </p>
                  <Button
                    className="w-full"
                    size="lg"
                    variant="default"
                    onClick={() => {
                      const size = BigInt(estimationResults.totalGasUsed);
                      setSizeValue(size);
                      onAnalyticsClose?.(size);
                    }}
                  >
                    Generate Quote
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>
      </Form>
    );
  }

  if (positionId) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {isLoadingCollateralChange ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <p className="text-lg">
              {endTime && Date.now() / 1000 > Number(endTime) ? (
                <>
                  Close your position and receive{' '}
                  <NumberDisplay
                    value={formatUnits(
                      withdrawableCollateral,
                      collateralAssetDecimals
                    )}
                  />{' '}
                  wstETH
                </>
              ) : (
                <>
                  Close your subscription early and receive approximately{' '}
                  <NumberDisplay
                    value={formatUnits(
                      collateralDelta < BigInt(0)
                        ? -collateralDelta
                        : collateralDelta,
                      collateralAssetDecimals
                    )}
                  />{' '}
                  {collateralAssetTicker}
                </>
              )}
            </p>
          )}
        </div>

        <Button
          className="w-full"
          onClick={handleClosePosition}
          disabled={
            pendingTxn ||
            (!(endTime && Date.now() / 1000 > Number(endTime)) &&
              (isLoadingCollateralChange || !!quoteError))
          }
        >
          {pendingTxn ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          Close Position
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex items-center mb-4">
          <div className="border border-border rounded-full p-1 mr-2 h-8 w-8 overflow-hidden">
            <img src="/eth.svg" alt="Ethereum" width="100%" height="100%" />
          </div>

          <h2 className="text-2xl font-semibold">{marketName} Subscription</h2>
        </div>

        <p className="mb-3 text-lg">
          Enter the amount of gas you expect to use between {formattedStartTime}{' '}
          and {formattedEndTime}.
        </p>

        <div className="mb-7">
          <FormField
            control={control}
            name="sizeInput"
            render={({ field }) => (
              <SizeInput
                setSize={(newSize) => {
                  setSizeValue(newSize);
                  field.onChange(newSize.toString());
                }}
                size={sizeValue}
                label="Gas Amount"
                error={quoteError || undefined}
                {...field}
              />
            )}
          />
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>How It Works</AlertTitle>
          <AlertDescription>
            <div>
              If the average gas price exceeds the quote during the period, you
              can redeem a rebate.
            </div>
            <a
              href="https://docs.foil.xyz"
              target="_blank"
              className="underline text-xs text-muted-foreground mt-2 inline-block"
              rel="noreferrer"
            >
              <BookTextIcon className="inline -mt-0.5 mr-1 h-3.5 w-3.5" />
              Read the docs
            </a>
          </AlertDescription>
        </Alert>

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
            <div className="flex gap-3 items-baseline min-h-[28px]">
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
      </form>
    </Form>
  );
};

export default Subscribe;
