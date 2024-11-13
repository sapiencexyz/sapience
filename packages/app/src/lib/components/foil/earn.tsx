'use client';

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

import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '~/components/ui/form';
import { Input } from '~/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
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
      collateralAmount: '',
      vaultShares: '',
    },
  });

  const collateralAmount = form.watch('collateralAmount');
  const vaultShares = form.watch('vaultShares');

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
          You cannot deposit vault shares unless you remove your deposited collateral.
        </div>
      );
    }

    return null;
  };

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-3">
          {collateralAssetTicker} Vault
        </h2>
        <div className="text-center text-sm text-muted-foreground mb-8">
          TVL: X wst ($X) - X% APY (based on trailing 2 month performance)
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <VaultChart />
          </div>
          
          <div>
            <div className="border border-border rounded-lg shadow-sm p-6">
              <p className="mb-4 text-lg">
                Deposit your collateral into the vault to earn rewards. At the end of an epoch, redeem your vault tokens for more collateral if the vault has profited.
              </p>
              
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)}>
                  <Tabs 
                    defaultValue="deposit" 
                    className="space-y-4"
                    onValueChange={(value) => setActiveTab(value as 'deposit' | 'withdraw')}
                  >
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="deposit">Deposit wstETH</TabsTrigger>
                      <TabsTrigger value="withdraw">Withdraw wstETH</TabsTrigger>
                    </TabsList>

                    <TabsContent value="deposit" className="space-y-4">
                      <FormField
                        control={form.control}
                        name="collateralAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Collateral Pending Conversion</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter amount" 
                                type="number"
                                step="any"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-sm text-muted-foreground">
                              Your wstETH wallet balance: 0
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {renderWarningMessage('collateral')}

                      <Button 
                        type="submit" 
                        className="w-full mt-6"
                        disabled={Number(vaultShares) > 0}
                      >
                        Update
                      </Button>

                      <Separator className="my-12" />

                      <p className="text-center text-sm">
                        The current epoch ends in approximately X days.
                      </p>

                      <Button type="submit" className="w-full mt-6">
                        Redeem fstETH
                      </Button>
                    </TabsContent>

                    <TabsContent value="withdraw" className="space-y-4">
                      <FormField
                        control={form.control}
                        name="vaultShares"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vault Shares Pending Conversion</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Enter amount"
                                type="number"
                                step="any"
                                {...field}
                              />
                            </FormControl>
                            <p className="text-sm text-muted-foreground">
                              Your fstETH wallet balance: 0
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {renderWarningMessage('shares')}

                      <Button 
                        type="submit" 
                        className="w-full mt-6"
                        disabled={Number(collateralAmount) > 0}
                      >
                        Update
                      </Button>

                      <Separator className="my-12" />

                      <p className="text-center text-sm">
                        The current epoch ends in approximately X days.
                      </p>

                      <Button type="submit" className="w-full mt-6">
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
