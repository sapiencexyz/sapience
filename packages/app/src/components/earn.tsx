'use client';

import { BookTextIcon, HelpCircle, InfoIcon, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { type FC, useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '~/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { Separator } from '~/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useToast } from '~/hooks/use-toast';
import { useResources } from '~/lib/hooks/useResources';

import { Label } from './ui/label';
// import VaultChart from './vaultChart';
import VaultChart from './vaultChart';
import { useAccount, useWriteContract } from 'wagmi';
import { useUserVaultData } from '~/lib/hooks/useUserVaultData';
import NumberDisplay from './numberDisplay';
import { formatUnits } from 'viem';
import { useVaultDeposit } from '~/lib/hooks/useVaultDeposit';
import { useVaultData } from '~/lib/hooks/useVaultData';
import useFoilDeployment from './useFoilDeployment';

interface FormValues {
  collateralAmount: string;
  vaultShares: string;
}

interface Props {
  slug: string;
}

const Earn: FC<Props> = ({ slug }) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [selectedVault, setSelectedVault] = useState<'yin' | 'yang'>('yin');
  const { theme, setTheme } = useTheme();
  const { data: resources } = useResources();
  const resource = resources?.find((r) => r.slug === slug);

  const { chainId } = useAccount();
  const { foilVaultData } = useFoilDeployment(chainId);

  const vaultData = useMemo(() => {
    return foilVaultData[selectedVault];
  }, [selectedVault, foilVaultData]);

  const {
    collateralAsset,
    decimals: collateralDecimals,
    epoch,
    duration,
    vaultSymbol: vaultSharesTicker,
    collateralSymbol: collateralTicker,
  } = useVaultData({
    vaultData,
  });
  const { collateralBalance, pendingRequest, claimableDeposit, refetchAll } =
    useUserVaultData({
      collateralAsset,
      vaultData,
    });

  const form = useForm<FormValues>({
    defaultValues: {
      collateralAmount: '0',
      vaultShares: '0',
    },
  });

  useEffect(() => {
    refetchAll();
  }, [selectedVault, refetchAll]);

  useEffect(() => {
    const val = pendingRequest?.amount
      ? formatUnits(pendingRequest.amount, collateralDecimals)
      : BigInt(0);

    form.setValue('collateralAmount', val.toString());
  }, [pendingRequest, form, collateralDecimals]);

  const collateralAmount = form.watch('collateralAmount');
  const vaultShares = form.watch('vaultShares');

  const collateralAmountDiff = useMemo(() => {
    const collateralAmountNum = Number(collateralAmount);
    if (!pendingRequest?.amount) return collateralAmountNum;
    return (
      collateralAmountNum -
      Number(formatUnits(pendingRequest.amount, collateralDecimals))
    );
  }, [collateralAmount, pendingRequest, collateralDecimals]);

  const {
    allowance,
    requestDeposit,
    approve,
    pendingTxn,
    isDepositConfirmed,
    isApproveConfirmed,
  } = useVaultDeposit({
    amount: collateralAmountDiff
      ? BigInt(Number(collateralAmountDiff) * 10 ** collateralDecimals)
      : BigInt(0),
    collateralAsset,
    vaultData,
  });

  useEffect(() => {
    if (isDepositConfirmed || isApproveConfirmed) {
      refetchAll();
    }
  }, [isDepositConfirmed, isApproveConfirmed, refetchAll]);

  const hasAllowance = useMemo(() => {
    return (
      Number(formatUnits(allowance, collateralDecimals)) >=
      Number(collateralAmountDiff)
    );
  }, [allowance, collateralAmountDiff, collateralDecimals]);

  const hasCollateralChanged = useMemo(() => {
    return Number(collateralAmount) !== 0;
  }, [collateralAmount]);

  const hasSharesChanged = useMemo(() => {
    return Number(vaultShares) !== 0;
  }, [vaultShares]);

  // const formattedCollateralAmount = useMemo(() => {
  //   return formatUnits(collateralAmount, collateralDecimals);
  // }, [collateralAmount, collateralDecimals]);

  useEffect(() => {
    if (selectedVault === 'yin' && theme !== 'light') {
      setTheme('light');
    } else if (selectedVault === 'yang' && theme !== 'dark') {
      setTheme('dark');
    }
  }, [selectedVault, theme, setTheme]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (activeTab === 'deposit') {
        console.log('values', values);
        // Handle deposit logic
        console.log('Depositing:', values.collateralAmount);
        if (hasAllowance) {
          await requestDeposit();
        } else {
          await approve();
        }
      } else {
        // Handle withdraw logic
        console.log('Withdrawing:', values.vaultShares);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Transaction failed. Please try again.',
      });
    }
  };

  const error = useMemo(() => {
    if (
      Number(collateralAmount) >
      Number(formatUnits(collateralBalance, collateralDecimals))
    ) {
      return 'Insufficient balance';
    }
    return null;
  }, [collateralAmount, collateralBalance, collateralDecimals]);

  const renderWarningMessage = (type: 'collateral' | 'shares') => {
    const hasCollateral = Number(collateralAmount) > 0;
    const hasShares = Number(vaultShares) > 0;

    if (type === 'collateral' && hasShares) {
      return (
        <div className="mt-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          You cannot deposit collateral unless you remove your vault shares.
        </div>
      );
    }

    if (type === 'shares' && hasCollateral) {
      return (
        <div className="mt-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          You cannot deposit vault shares unless you remove your deposited
          collateral.
        </div>
      );
    }

    return null;
  };

  const buttonText = useMemo(() => {
    if (pendingTxn) return 'Pending';
    if (hasAllowance) {
      if (Number(collateralAmountDiff) < 0) {
        return 'Reduce Deposit';
      }
      return 'Deposit';
    }
    return 'Approve';
  }, [pendingTxn, hasAllowance, collateralAmountDiff]);

  const depositCollateralDifferenceText = useMemo(() => {
    if (!pendingRequest?.amount || collateralAmountDiff === 0) return null;
    return (
      <p className="text-sm text-muted-foreground" style={{ marginTop: '0' }}>
        Deposit Amount:{' '}
        <NumberDisplay
          value={formatUnits(pendingRequest.amount, collateralDecimals)}
        />{' '}
        → <NumberDisplay value={collateralAmount} /> {collateralTicker}
      </p>
    );
  }, [
    pendingRequest?.amount,
    collateralAmountDiff,
    collateralAmount,
    collateralTicker,
    collateralDecimals,
  ]);

  const nextEpochStartInDays = useMemo(() => {
    if (!epoch?.startTime || !duration) return 0;
    const durationInSeconds = Number(duration);
    const startTimeInSeconds = Number(epoch.startTime);
    const nextEpochStartTime =
      BigInt(startTimeInSeconds) + BigInt(2) * BigInt(durationInSeconds);

    const nextEpochStartDate = new Date(Number(nextEpochStartTime) * 1000);
    const now = new Date();
    return Math.ceil(
      (nextEpochStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  }, [epoch, duration]);

  const currentEpochEndInDays = useMemo(() => {
    if (!epoch?.endTime) return 0;
    const endTimeInSeconds = Number(epoch.endTime);
    const endDate = new Date(endTimeInSeconds * 1000);
    const now = new Date();
    return Math.ceil(
      (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
  }, [epoch]);

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-7xl mx-auto">
        <div className=" mx-auto h-16 w-16 mb-4">
          <Image
            src={resource?.iconPath || '/eth.svg'}
            alt={resource?.name || 'Resource'}
            width={56}
            height={56}
          />
        </div>
        <h2 className="text-4xl font-bold text-center mb-3">
          {resource?.name} Vault
        </h2>

        <div className="w-full max-w-sm mx-auto ">
          <p className="mb-9 text-center">
            The vault smart contracts provide liquidity to markets and roll
            across periods automatically.
          </p>

          <div className="border border-border rounded-lg shadow-sm p-6 mb-9">
            <Label>Select Vault</Label>
            <Tabs
              defaultValue="yin"
              className="mt-1.5"
              onValueChange={(value) =>
                setSelectedVault(value as 'yin' | 'yang')
              }
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="yin">Yin Vault</TabsTrigger>
                <TabsTrigger value="yang">Yang Vault</TabsTrigger>
              </TabsList>
              <TabsContent value="yin">
                <div className="pt-3">
                  <p className="text-sm text-muted-foreground">
                    The Yin vault provides liquidity to the current period and
                    the one starting in {nextEpochStartInDays} days.
                  </p>
                </div>
              </TabsContent>
              <TabsContent value="yang">
                <div className="pt-3">
                  <p className="text-sm text-muted-foreground">
                    The Yang vault provides liquidity to the one starting in X
                    days.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <a
              href="https://docs.foil.xyz"
              target="_blank"
              className="underline text-sm text-muted-foreground mt-3 inline-block"
              rel="noreferrer"
            >
              <BookTextIcon className="inline -mt-0.5 mr-1 h-3.5 w-3.5" />
              Read the docs
            </a>
          </div>

          <div className="border border-border rounded-lg shadow-sm p-6 mb-9">
            <div className="flex items-start gap-1.5">
              <span className="w-4 mt-0.5">
                <InfoIcon className="h-4 w-4" />
              </span>
              <p className="text-sm">
                <strong className="font-medium">
                  Foil is currenty in Beta.
                </strong>{' '}
                A new version is under development. The smart contracts cannot
                be changed, so you will need to opt-in and migrate to future
                vault versions to continue providing liquidity.
              </p>
            </div>
          </div>
          <div className="border border-border rounded-lg shadow-sm p-6">
            <h3 className="text-2xl font-bold mb-3">
              {selectedVault === 'yin' ? 'Yin' : 'Yang'} Vault
            </h3>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <Tabs
                  defaultValue="deposit"
                  className="space-y-4"
                  onValueChange={(value) =>
                    setActiveTab(value as 'deposit' | 'withdraw')
                  }
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="deposit">
                      Deposit {collateralTicker}
                    </TabsTrigger>
                    <TabsTrigger value="withdraw">
                      Withdraw {collateralTicker}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="deposit">
                    <FormField
                      control={form.control}
                      name="collateralAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            Collateral Pending Conversion
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-4 w-4" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>
                                    At the start of the next epoch, this
                                    collateral will be converted to vault shares
                                    ({vaultSharesTicker}) for redemption.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </FormLabel>
                          <FormControl>
                            <div className="flex ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 rounded-md">
                              <Input
                                placeholder="Enter amount"
                                type="number"
                                step="any"
                                className="rounded-r-none border-r-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                {...field}
                              />
                              <div className="inline-flex items-center justify-center rounded-r-md border border-l-0 border-input bg-secondary px-3 text-sm text-secondary-foreground h-10">
                                {collateralTicker}
                              </div>
                            </div>
                          </FormControl>
                          <p className="text-sm text-muted-foreground">
                            Wallet Balance:{' '}
                            <NumberDisplay
                              value={formatUnits(
                                collateralBalance,
                                collateralDecimals
                              )}
                            />{' '}
                            {collateralTicker}
                          </p>
                          {depositCollateralDifferenceText}
                          <FormMessage />
                          {error && (
                            <p className="text-sm font-medium text-destructive mt-2">
                              {error}
                            </p>
                          )}
                        </FormItem>
                      )}
                    />

                    {renderWarningMessage('collateral')}

                    <Button
                      type="submit"
                      className="w-full mt-4"
                      disabled={
                        Number(vaultShares) > 0 ||
                        collateralAmountDiff === 0 ||
                        pendingTxn
                      }
                    >
                      {pendingTxn && !error ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                      ) : null}
                      {buttonText}
                    </Button>

                    <Separator className="mt-6 mb-4" />

                    <p className="text-center text-sm font-medium">
                      The current epoch ends in approximately{' '}
                      {currentEpochEndInDays} days.
                    </p>

                    <p className="mt-2 text-sm text-muted-foreground">
                      Claimable Amount:{' '}
                      <NumberDisplay
                        value={formatUnits(
                          claimableDeposit,
                          collateralDecimals
                        )}
                      />{' '}
                      {collateralTicker}
                    </p>

                    <Button
                      type="submit"
                      className="w-full mt-3"
                      disabled={claimableDeposit === BigInt(0)}
                    >
                      Redeem {vaultSharesTicker}
                    </Button>
                  </TabsContent>

                  <TabsContent value="withdraw">
                    <FormField
                      control={form.control}
                      name="vaultShares"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-1">
                            Vault Shares Pending Conversion
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <HelpCircle className="h-4 w-4" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  <p>
                                    At the start of the next epoch, these vault
                                    shares will be converted to collateral (
                                    {collateralTicker}) for redemption.
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </FormLabel>
                          <FormControl>
                            <div className="flex">
                              <Input
                                placeholder="Enter amount"
                                type="number"
                                step="any"
                                className="rounded-r-none border-r-0"
                                {...field}
                              />
                              <div className="inline-flex items-center justify-center rounded-r-md border border-l-0 border-input bg-secondary px-3 text-sm text-secondary-foreground h-10">
                                {collateralTicker}
                              </div>
                            </div>
                          </FormControl>
                          <p className="text-sm text-muted-foreground">
                            Wallet Balance: 0 {vaultSharesTicker}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {renderWarningMessage('shares')}

                    <Button
                      type="submit"
                      className="w-full mt-4"
                      disabled={
                        Number(collateralAmount) > 0 || !hasSharesChanged
                      }
                    >
                      Deposit
                    </Button>

                    <Separator className="mt-6 mb-4" />

                    <p className="text-center text-sm font-medium">
                      The current epoch ends in approximately{' '}
                      {currentEpochEndInDays} days.
                    </p>

                    <Button type="submit" className="w-full mt-3" disabled>
                      Redeem {collateralTicker}
                    </Button>
                  </TabsContent>
                </Tabs>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Earn;
