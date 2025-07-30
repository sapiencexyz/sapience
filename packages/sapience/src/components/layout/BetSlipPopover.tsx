'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Switch } from '@sapience/ui/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sapience/ui/components/ui/tabs';
import Link from 'next/link';
import { useForm, FormProvider } from 'react-hook-form';
import { z } from 'zod';

import { useBetSlipContext } from '~/lib/context/BetSlipContext';
import {
  WagerInput,
  wagerAmountSchema,
} from '~/components/forecasting/forms/inputs/WagerInput';
import WagerFormFactory from '~/components/forecasting/forms/WagerFormFactory';

// Default values based on app configuration
const DEFAULT_CHAIN_ID = 8453; // Base
const DEFAULT_COLLATERAL_ASSET = '0x5875eee11cf8398102fdad704c9e96607675467a'; // sUSDS
const DEFAULT_COLLATERAL_SYMBOL = 'sUSDS';

// Form schema
const _betSlipFormSchema = z.object({
  wagerAmount: wagerAmountSchema,
});

type BetSlipFormData = z.infer<typeof _betSlipFormSchema>;

const BetSlipPopover = () => {
  const {
    betSlipPositions,
    removePosition,
    updatePosition,
    isPopoverOpen,
    setIsPopoverOpen,
  } = useBetSlipContext();

  const methods = useForm<BetSlipFormData>({
    defaultValues: {
      wagerAmount: '',
    },
  });

  const handleSubmit = (data: BetSlipFormData) => {
    // TODO: Implement bet slip submission logic
    console.log('Bet slip form data:', data);
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="rounded-full px-6" size="default">
          Wager
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={`${betSlipPositions.length === 0 ? 'w-80 p-6 py-14' : 'w-[20rem] p-0'}`}
        align="end"
      >
        {betSlipPositions.length === 0 ? (
          <div className="text-center space-y-3">
            <p className="text-base text-muted-foreground">
              Place a wager on future events
            </p>
            <Button
              variant="default"
              size="xs"
              asChild
            >
              <Link
                href="/markets"
                onClick={() => setIsPopoverOpen(false)}
              >
                Browse Prediction Markets
              </Link>
            </Button>
          </div>
        ) : (
          <Tabs defaultValue="multiple" className="w-full">
            <div className="px-3 pt-3">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="singles">Singles</TabsTrigger>
                <TabsTrigger value="multiple">Multiple</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="singles" className="mt-0">
              <div className="p-3 space-y-4 max-h-96 overflow-y-auto">
                {betSlipPositions.map((position) => (
                  <div key={position.id} className="border-b border-border pb-4 last:border-b-0">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium text-foreground truncate pr-2">
                        {position.question}
                      </h3>
                      <button
                        onClick={() => removePosition(position.id)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                    <WagerFormFactory
                      marketClassification={position.marketClassification}
                      marketGroupData={position.marketGroupData}
                      isPermitted={true}
                      onSuccess={(txHash) => {
                        console.log('Wager successful:', txHash);
                        // Optional: Remove position after successful wager
                        // removePosition(position.id);
                      }}
                    />
                  </div>
                ))}
                {betSlipPositions.length === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">
                      No wagers in your bet slip
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="multiple" className="mt-0">
              <FormProvider {...methods}>
                <form
                  onSubmit={methods.handleSubmit(handleSubmit)}
                  className="space-y-4 p-3"
                >
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {betSlipPositions.map((position) => (
                      <div
                        key={position.id}
                        className="flex items-center justify-between py-4 border-b border-border"
                      >
                        <div className="flex-1 pr-3">
                          <p className="text-lg font-normal text-foreground">
                            {position.question}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 pt-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-medium">
                              YES
                            </span>
                            <Switch
                              checked={!position.prediction}
                              onCheckedChange={(checked) =>
                                updatePosition(position.id, {
                                  prediction: !checked,
                                })
                              }
                              className="data-[state=checked]:bg-red-500 data-[state=unchecked]:bg-green-600"
                            />
                            <span className="text-xs text-muted-foreground font-medium">
                              NO
                            </span>
                          </div>

                          <button
                            onClick={() => removePosition(position.id)}
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="pt-1">
                    <WagerInput
                      collateralSymbol={DEFAULT_COLLATERAL_SYMBOL}
                      collateralAddress={DEFAULT_COLLATERAL_ASSET}
                      chainId={DEFAULT_CHAIN_ID}
                    />
                  </div>

                  <div className="pt-2">
                    <Button className="w-full" disabled type="submit" size="lg">
                      Quote Unavailable
                    </Button>
                  </div>
                </form>
              </FormProvider>
            </TabsContent>
          </Tabs>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default BetSlipPopover;