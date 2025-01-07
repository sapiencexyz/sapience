'use client';

import {
  ArrowUpDown,
  BookTextIcon,
  ChartNoAxesColumn,
  ChevronLeft,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { type FC, useState, useContext, useMemo } from 'react';
import React from 'react';
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
import { MarketContext } from '~/lib/context/MarketProvider';

import VaultChart from './vaultChart';

interface FormValues {
  collateralAmount: string;
  vaultShares: string;
}

const Earn: FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const { collateralAssetTicker } = useContext(MarketContext);

  const form = useForm<FormValues>({
    defaultValues: {
      collateralAmount: '0',
      vaultShares: '0',
    },
  });

  const collateralAmount = form.watch('collateralAmount');
  const vaultShares = form.watch('vaultShares');

  const hasCollateralChanged = useMemo(() => {
    return Number(collateralAmount) !== 0;
  }, [collateralAmount]);

  const hasSharesChanged = useMemo(() => {
    return Number(vaultShares) !== 0;
  }, [vaultShares]);

  const onSubmit = async (values: FormValues) => {
    try {
      if (activeTab === 'deposit') {
        // Handle deposit logic
        console.log('Depositing:', values.collateralAmount);
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

  return (
    <div className="container mx-auto px-4 py-9">
      <div className="max-w-7xl mx-auto">
        <div className="border border-border rounded-full p-1.5 mx-auto h-14 w-14 overflow-hidden mb-4">
          <img src="/eth.svg" alt="Ethereum" width="100%" height="100%" />
        </div>
        <h2 className="text-4xl font-bold text-center mb-2">
          Foil {collateralAssetTicker} Vault
        </h2>
        <div className="hidden text-center font-light text-muted-foreground">
          <span className="font-medium tracking-wider">TVL</span> 420 wstETH
          <span className="ml-8 mr-1">
            12% <span className="ml-1 font-medium tracking-wider">APY</span>
          </span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <HelpCircle className="inline -mt-1 h-3.5 w-3.5" />
              </TooltipTrigger>
              <TooltipContent>
                <p>This is based on annualized fees over the last 30 days.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="md:col-span-2 h-full flex flex-col hidden">
            <h2 className="text-2xl font-light tracking-tight text-muted-foreground mb-4">
              Vault Performance
            </h2>
            <div className="h-full">
              <VaultChart />
            </div>
          </div>

          <div className="md:pt-11 md:pb-8 md:col-start-2">
            <div className="border border-border rounded-lg shadow-sm p-6">
              <p className="mb-1 text-md">
                Deposit collateral to have the vault smart contract provide
                liquidity to the market and roll between epochs automatically.
              </p>
              <div className=" mb-4">
                <a
                  href="https://docs.foil.xyz/token-vault"
                  target="_blank"
                  className="underline text-xs text-muted-foreground"
                  rel="noreferrer"
                >
                  <BookTextIcon className="inline -mt-0.5 mr-1 h-3.5 w-3.5" />
                  Read the docs
                </a>
              </div>

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
                      <TabsTrigger value="deposit">Deposit wstETH</TabsTrigger>
                      <TabsTrigger value="withdraw">
                        Withdraw wstETH
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
                                      shares (fstETH) for redemption.
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
                                  wstETH
                                </div>
                              </div>
                            </FormControl>
                            <p className="text-sm text-muted-foreground">
                              Wallet Balance: 2.1337 wstETH
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {renderWarningMessage('collateral')}

                      <Button
                        type="submit"
                        className="w-full mt-4"
                        disabled={
                          Number(vaultShares) > 0 || !hasCollateralChanged
                        }
                      >
                        Deposit
                      </Button>

                      <Separator className="mt-6 mb-4" />

                      <p className="text-center text-sm font-medium">
                        The current epoch ends in approximately 4 days.
                      </p>

                      <Button type="submit" className="w-full mt-3" disabled>
                        Redeem fstETH
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
                                      collateral (wstETH) for redemption.
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
                                  wstETH
                                </div>
                              </div>
                            </FormControl>
                            <p className="text-sm text-muted-foreground">
                              Wallet Balance: 0 fstETH
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
                        The current epoch ends in approximately 4 days.
                      </p>

                      <Button type="submit" className="w-full mt-3" disabled>
                        Redeem wstETH
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
