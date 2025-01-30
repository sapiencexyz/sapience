'use client';

import { BookTextIcon, HelpCircle, AlertTriangle } from 'lucide-react';
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

  useEffect(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [selectedVault]);

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

  const collateralTicker = 'wstETH';
  const vaultSharesTicker = `fstethYIN`;

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
            <a
              href="https://docs.foil.xyz/token-vault"
              target="_blank"
              className="inline-block text-blue-500 hover:text-blue-600 ml-1 -translate-y-0.5"
              rel="noopener noreferrer"
            >
              <BookTextIcon className="h-3.5 w-3.5 inline-block" />
            </a>
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
                    the one starting in X days.
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
          </div>

          <div className="border border-border rounded-lg shadow-sm p-6 mb-9">
            <div className="flex items-start gap-1.5">
              <span className="w-4 mt-0.5">
              <AlertTriangle className="h-4 w-4" />
              </span>
              <p className='text-sm'><strong className='font-medium'>Foil is currenty in Beta.</strong> An upgraded version of the protocol will be deployed. You will need to withdraw your collateral and deposit again to continue providing liquidity in the future.</p>
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
                            Wallet Balance: 2.1337 {collateralTicker}
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
                      The current epoch ends in approximately 4 days.
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
