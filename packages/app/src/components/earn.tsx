'use client';

import Decimal from 'decimal.js';
import { BookTextIcon, HelpCircle, InfoIcon, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { type FC, useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { formatUnits } from 'viem';

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
import { useUserVaultData } from '~/lib/hooks/useUserVaultData';
import { useVaultActions } from '~/lib/hooks/useVaultActions';
import { useVaultData } from '~/lib/hooks/useVaultData';

import NumberDisplay from './numberDisplay';
import { Label } from './ui/label';
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

  // Get the appropriate market based on the selected vault type
  const market = useMemo(() => {
    if (!resource?.markets) return null;
    return resource.markets.find((m) => m.isYin === (selectedVault === 'yin'));
  }, [resource, selectedVault]);

  // Load vault data using market info
  const { foilVaultData } = useFoilDeployment(market?.chainId);

  const vaultData = useMemo(() => {
    if (!market) return null;
    return foilVaultData[selectedVault];
  }, [selectedVault, foilVaultData, market]);

  const {
    collateralAsset,
    decimals: collateralDecimals = 18,
    vaultDecimals = 18,
    epoch,
    duration,
    vaultSymbol: vaultSharesTicker = '',
    collateralSymbol: collateralTicker = '',
  } = useVaultData({
    vaultData,
  }) || {};
  const {
    collateralBalance,
    pendingRequest,
    claimableDeposit,
    claimableRedeem,
    vaultShares: userVaultShares,
    refetchAll,
  } = useUserVaultData({
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
    if (!pendingRequest) return;

    if (pendingRequest.transactionType === 1) {
      form.setValue(
        'collateralAmount',
        formatUnits(pendingRequest.amount, collateralDecimals)
      );
    } else {
      form.setValue(
        'vaultShares',
        formatUnits(pendingRequest.amount, vaultDecimals)
      );
    }
  }, [pendingRequest, form, collateralDecimals, vaultDecimals, activeTab]);

  const collateralAmount = form.watch('collateralAmount');
  const vaultShares = form.watch('vaultShares');

  const collateralAmountDiff = useMemo(() => {
    const collateralAmountNum = new Decimal(collateralAmount);
    if (!pendingRequest?.amount || pendingRequest.transactionType === 2)
      return collateralAmountNum;

    return collateralAmountNum.minus(
      new Decimal(formatUnits(pendingRequest.amount, collateralDecimals))
    );
  }, [collateralAmount, pendingRequest, collateralDecimals]);

  const vaultSharesDiff = useMemo(() => {
    const vaultSharesNum = new Decimal(vaultShares);
    if (!pendingRequest?.amount || pendingRequest.transactionType === 1)
      return vaultSharesNum;
    return vaultSharesNum.minus(
      new Decimal(formatUnits(pendingRequest.amount, vaultDecimals))
    );
  }, [vaultShares, pendingRequest, vaultDecimals]);

  const actionAmount = useMemo(() => {
    if (activeTab === 'deposit') {
      return collateralAmountDiff.equals(0)
        ? BigInt(0)
        : BigInt(
            collateralAmountDiff
              .times(new Decimal(10 ** collateralDecimals))
              .toNumber()
          );
    }
    return vaultSharesDiff.equals(0)
      ? BigInt(0)
      : BigInt(
          vaultSharesDiff.times(new Decimal(10 ** vaultDecimals)).toNumber()
        );
  }, [
    activeTab,
    collateralAmountDiff,
    vaultSharesDiff,
    collateralDecimals,
    vaultDecimals,
  ]);

  const {
    allowance,
    createRequest,
    approve,
    pendingTxn,
    isDepositConfirmed,
    isApproveConfirmed,
    redeem,
    deposit,
  } = useVaultActions({
    amount: actionAmount,
    collateralAsset,
    vaultData,
    type: activeTab,
  });

  useEffect(() => {
    if (isDepositConfirmed || isApproveConfirmed) {
      refetchAll();
    }
  }, [isDepositConfirmed, isApproveConfirmed, refetchAll]);

  const hasAllowance = useMemo(() => {
    if (activeTab === 'deposit') {
      return (
        Number(formatUnits(allowance, collateralDecimals)) >=
        collateralAmountDiff.toNumber()
      );
    }
    return (
      Number(formatUnits(allowance, collateralDecimals)) >=
      vaultSharesDiff.toNumber()
    );
  }, [
    activeTab,
    allowance,
    collateralAmountDiff,
    collateralDecimals,
    vaultSharesDiff,
  ]);

  useEffect(() => {
    if (selectedVault === 'yin' && theme !== 'light') {
      setTheme('light');
    } else if (selectedVault === 'yang' && theme !== 'dark') {
      setTheme('dark');
    }
  }, [selectedVault, theme, setTheme]);

  useEffect(() => {
    if (resource?.name) {
      document.title = `${resource.name} Vault | Foil`;
    }
  }, [resource?.name]);

  const onSubmit = async () => {
    try {
      if (hasAllowance) {
        await createRequest();
      } else {
        await approve();
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
      activeTab === 'deposit' &&
      Number(collateralAmount) >
        Number(formatUnits(collateralBalance, collateralDecimals))
    ) {
      return 'Insufficient balance';
    }
    if (
      activeTab === 'withdraw' &&
      Number(vaultShares) > Number(formatUnits(userVaultShares, 18))
    ) {
      return 'Insufficient balance';
    }
    return null;
  }, [
    collateralAmount,
    collateralBalance,
    collateralDecimals,
    vaultShares,
    userVaultShares,
    activeTab,
  ]);

  const warningMessage = useMemo(() => {
    if (!pendingRequest?.amount || !epoch) return null;

    const isSameEpoch = pendingRequest.requestInitiatedEpoch === epoch.epochId;
    if (activeTab === 'deposit') {
      let msg;
      if (!isSameEpoch) {
        msg = 'You cannot deposit until you claim your previous request.';
      } else if (pendingRequest.transactionType === 2) {
        msg = 'You have a pending shares withdrawal request already.';
      } else {
        return null;
      }
      return (
        <div className="mt-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {msg}
        </div>
      );
    }

    if (activeTab === 'withdraw') {
      let msg;
      if (!isSameEpoch) {
        msg =
          'You cannot redeem vault shares until you claim your previous request.';
      } else if (pendingRequest.transactionType === 1) {
        msg = 'You have a pending deposit request already.';
      } else {
        return null;
      }
      return (
        <div className="mt-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {msg}
        </div>
      );
    }

    return null;
  }, [activeTab, pendingRequest, epoch]);

  const depositButtonText = useMemo(() => {
    if (pendingTxn) return 'Pending';
    if (hasAllowance) {
      if (collateralAmountDiff.lt(0)) {
        return 'Reduce Deposit';
      }
      return 'Deposit';
    }
    return 'Approve';
  }, [pendingTxn, hasAllowance, collateralAmountDiff]);

  const redeemButtonText = useMemo(() => {
    if (pendingTxn) return 'Pending';
    if (vaultSharesDiff.lt(0)) {
      return 'Reduce Redeem';
    }
    return 'Redeem';
  }, [pendingTxn, vaultSharesDiff]);

  const depositCollateralDifferenceText = useMemo(() => {
    if (!pendingRequest?.amount || collateralAmountDiff.equals(0)) return null;
    return (
      <p className="text-sm text-muted-foreground" style={{ marginTop: '0' }}>
        Deposit Amount:{' '}
        <NumberDisplay
          value={formatUnits(pendingRequest.amount, collateralDecimals)}
          precision={collateralDecimals}
        />{' '}
        →{' '}
        <NumberDisplay
          value={collateralAmount}
          precision={collateralDecimals}
        />{' '}
        {collateralTicker}
      </p>
    );
  }, [
    pendingRequest?.amount,
    collateralAmountDiff,
    collateralAmount,
    collateralTicker,
    collateralDecimals,
  ]);

  const redeemCollateralDifferenceText = useMemo(() => {
    if (!pendingRequest?.amount || vaultSharesDiff.equals(0)) return null;
    return (
      <p className="text-sm text-muted-foreground" style={{ marginTop: '0' }}>
        Redeem Amount:{' '}
        <NumberDisplay
          value={formatUnits(pendingRequest.amount, vaultDecimals)}
          precision={vaultDecimals}
        />{' '}
        → <NumberDisplay value={vaultShares} precision={vaultDecimals} />{' '}
        {vaultSharesTicker}
      </p>
    );
  }, [
    pendingRequest?.amount,
    vaultSharesDiff,
    vaultShares,
    vaultDecimals,
    vaultSharesTicker,
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
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-7xl mx-auto">
        <div className=" mx-auto h-20 w-20 mb-4">
          <Image
            src={resource?.iconPath || ''}
            alt={resource?.name || 'Resource'}
            width={200}
            height={200}
            className="grayscale"
          />
        </div>
        <h2 className="text-4xl font-bold text-center mb-3">
          {resource?.name} Vault
        </h2>

        <div className="w-full mx-auto">
          <p className="mb-9 text-center max-w-sm mx-auto">
            The vault smart contracts provide liquidity to markets and roll
            across periods automatically.
          </p>

          <div className="lg:grid lg:grid-cols-2 lg:gap-8 max-w-[790px] mx-auto">
            <div className="mx-auto w-full lg:flex lg:flex-col">
              <div className="border border-border rounded-lg shadow-sm p-6 mb-auto">
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
                    <p className="pt-2">
                      The Yin vault provides liquidity to the current period and
                      the period starting in {nextEpochStartInDays} days.
                    </p>
                  </TabsContent>
                  <TabsContent value="yang">
                    <p className="pt-2">
                      The Yang vault provides liquidity to the period starting
                      in {nextEpochStartInDays} days.
                    </p>
                  </TabsContent>
                </Tabs>
              </div>

              <a
                href="https://docs.foil.xyz/token-vault"
                target="_blank"
                rel="noreferrer"
                className="block mt-6 lg:mt-0"
              >
                <Button
                  variant="outline"
                  className="w-full h-auto p-5 shadow-md"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-11 h-11 opacity-80">
                      <BookTextIcon
                        strokeWidth={1}
                        className="scale-[2.75] origin-top-left"
                      />
                    </div>
                    <div className="flex flex-col items-start">
                      <span className="text-base font-medium">
                        Read the docs
                      </span>
                      <span className="text-sm text-muted-foreground font-normal">
                        “Where does the yield come from?”
                      </span>
                    </div>
                  </div>
                </Button>
              </a>

              <div className="border border-border rounded-lg shadow-sm p-6 lg:mt-auto mt-6">
                <div className="flex items-start gap-1.5">
                  <span className="w-4 mt-0.5">
                    <InfoIcon className="h-4 w-4" />
                  </span>
                  <p className="text-sm">
                    <strong className="font-medium">
                      Foil is currenty in Beta.
                    </strong>{' '}
                    A new version is under development. The smart contracts
                    cannot be changed, so you will need to migrate into future
                    vault versions to continue providing liquidity.
                  </p>
                </div>
              </div>
            </div>

            <div className="border border-border rounded-lg shadow-sm p-6 mt-6 lg:mt-0 mx-auto w-full">
              <h3 className="text-2xl font-bold mb-4">
                {selectedVault === 'yin' ? 'Yin' : 'Yang'} Vault
              </h3>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <Tabs
                    defaultValue="deposit"
                    className="space-y-6"
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
                                      collateral will be converted to vault
                                      shares ({vaultSharesTicker}) for
                                      redemption.
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

                      {warningMessage}

                      <Button
                        type="submit"
                        className="w-full mt-4"
                        disabled={
                          collateralAmountDiff.equals(0) ||
                          pendingTxn ||
                          warningMessage !== null
                        }
                      >
                        {pendingTxn && !error ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : null}
                        {depositButtonText}
                      </Button>

                      <Separator className="mt-8 mb-6" />

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
                        className="w-full mt-3"
                        disabled={claimableDeposit === BigInt(0) || pendingTxn}
                        onClick={() => deposit()}
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
                                      At the start of the next epoch, these
                                      vault shares will be converted to
                                      collateral ({collateralTicker}) for
                                      redemption.
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
                                  {vaultSharesTicker}
                                </div>
                              </div>
                            </FormControl>
                            <p className="text-sm text-muted-foreground">
                              Wallet Balance:{' '}
                              <NumberDisplay
                                value={formatUnits(userVaultShares, 18)}
                              />{' '}
                              {vaultSharesTicker}
                            </p>
                            {redeemCollateralDifferenceText}
                            <FormMessage />
                            {error && (
                              <p className="text-sm font-medium text-destructive mt-2">
                                {error}
                              </p>
                            )}
                          </FormItem>
                        )}
                      />

                      {warningMessage}

                      <Button
                        type="submit"
                        className="w-full mt-4"
                        disabled={
                          vaultSharesDiff.equals(0) ||
                          pendingTxn ||
                          warningMessage !== null
                        }
                      >
                        {pendingTxn && !error ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : null}
                        {redeemButtonText}
                      </Button>

                      <Separator className="mt-6 mb-4" />

                      <p className="text-center text-sm font-medium">
                        The current epoch ends in approximately{' '}
                        {currentEpochEndInDays} days.
                      </p>

                      <p className="mt-2 text-sm text-muted-foreground">
                        Claimable Amount:{' '}
                        <NumberDisplay
                          value={formatUnits(claimableRedeem, vaultDecimals)}
                        />{' '}
                        {vaultSharesTicker}
                      </p>

                      <Button
                        className="w-full mt-3"
                        disabled={claimableRedeem === BigInt(0) || pendingTxn}
                        onClick={() => redeem()}
                      >
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
    </div>
  );
};

export default Earn;
