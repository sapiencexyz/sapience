'use client';

import { Button } from '@sapience/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { Switch } from '@sapience/ui/components/ui/switch';
import { SquareStack, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useForm, FormProvider } from 'react-hook-form';
import { z } from 'zod';

import { useParlayContext } from '~/lib/context/ParlayContext';
import {
  WagerInput,
  wagerAmountSchema,
} from '~/components/forecasting/forms/inputs/WagerInput';

// Default values based on app configuration
const DEFAULT_CHAIN_ID = 8453; // Base
const DEFAULT_COLLATERAL_ASSET = '0x5875eee11cf8398102fdad704c9e96607675467a'; // sUSDS
const DEFAULT_COLLATERAL_SYMBOL = 'sUSDS';

// Form schema
const _parlayFormSchema = z.object({
  wagerAmount: wagerAmountSchema,
});

type ParlayFormData = z.infer<typeof _parlayFormSchema>;

const ParlaysPopover = () => {
  const {
    parlayPositions,
    removePosition,
    updatePosition,
    isPopoverOpen,
    setIsPopoverOpen,
  } = useParlayContext();

  const methods = useForm<ParlayFormData>({
    defaultValues: {
      wagerAmount: '',
    },
  });

  const handleSubmit = (data: ParlayFormData) => {
    // TODO: Implement parlay submission logic
    console.log('Parlay form data:', data);
  };

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="rounded-full px-6" size="default">
          <SquareStack className="h-4 w-4" />
          Parlays
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={`${parlayPositions.length === 0 ? 'w-80 p-6 py-14' : 'w-[20rem] p-0'}`}
        align="end"
      >
        {parlayPositions.length === 0 ? (
          <div className="text-center space-y-3">
            <p className="text-base text-muted-foreground">
              Build a wager that combines multiple outcomes.
            </p>
            <Link
              href="/markets"
              onClick={() => setIsPopoverOpen(false)}
              className="inline-flex items-center text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Browse prediction markets
              <ChevronRight className="ml-1 h-3 w-3" />
            </Link>
          </div>
        ) : (
          <FormProvider {...methods}>
            <form
              onSubmit={methods.handleSubmit(handleSubmit)}
              className="space-y-4 p-3"
            >
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {parlayPositions.map((position) => (
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
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ParlaysPopover;
