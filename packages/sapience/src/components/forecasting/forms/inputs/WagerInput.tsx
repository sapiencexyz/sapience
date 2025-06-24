import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sapience/ui/components/ui/popover';
import { HelpCircle, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { z } from 'zod';

import { getChainShortName } from '~/lib/utils/util';

import CollateralBalance from './CollateralBalance';

interface WagerInputProps {
  name?: string;
  collateralSymbol: string;
  collateralAddress: `0x${string}`;
  chainId: number;
}

// Define the wager schema that will be used across all forms
export const wagerAmountSchema = z
  .string()
  .min(1, 'Please enter a wager amount')
  .refine((val) => !Number.isNaN(Number(val)), {
    message: 'Must be a valid number',
  })
  .refine((val) => Number(val) > 0, {
    message: 'Amount must be greater than 0',
  });

function SUsdsHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="ml-1 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer pointer-events-auto"
          aria-label="Information about sUSDS"
          onClick={(e) => e.stopPropagation()}
        >
          <HelpCircle size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="left" className="w-[370px] p-4 text-sm">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sky.svg" alt="Sky Protocol Logo" className="h-14 w-auto" />
          <div className="flex flex-col text-left">
            <p className="mb-1.5">
              sUSDS is the yield-bearing token of the Sky Protocol, currently
              earning 4.5% APY.
            </p>
            <a
              href="https://sky.money/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/70 hover:text-muted-foreground flex items-center gap-1 text-xs tracking-widest transition-all duration-300 font-semibold"
            >
              LEARN MORE
              <ChevronRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function WagerInput({
  name = 'wagerAmount',
  collateralSymbol,
  collateralAddress,
  chainId,
}: WagerInputProps) {
  const {
    register,
    formState: { errors },
    setError,
    clearErrors,
    getValues,
    trigger,
    setValue,
  } = useFormContext();
  const chainShortName = getChainShortName(chainId);

  // Validate the wager amount independently using the schema
  useEffect(() => {
    const validateWagerAmount = async () => {
      const currentValue = getValues(name);
      if (!currentValue) return; // Don't validate empty values

      try {
        // Validate against our schema
        wagerAmountSchema.parse(currentValue);
        clearErrors(name);
      } catch (error) {
        if (error instanceof z.ZodError) {
          // Set the first error message
          const firstError = error.errors[0];
          setError(name, {
            type: 'manual',
            message: firstError?.message || 'Invalid wager amount',
          });
        }
      }
    };

    validateWagerAmount();
  }, [name, getValues, clearErrors, setError]);

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <Label htmlFor={`${name}-input`}>Wager Amount</Label>
        <CollateralBalance
          collateralSymbol={collateralSymbol}
          collateralAddress={collateralAddress}
          chainId={chainId}
          chainShortName={chainShortName}
          onSetWagerAmount={(amount) =>
            setValue(name, amount, {
              shouldValidate: true,
              shouldDirty: true,
              shouldTouch: true,
            })
          }
        />
      </div>
      <div className="relative">
        <Input
          id={`${name}-input`}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          className={`pr-24 ${errors[name] ? 'border-destructive' : ''}`}
          {...register(name, {
            onChange: (e) => {
              // Allow only numbers and a single decimal point
              const { value } = e.target;
              const cleanedValue = value.replace(/[^0-9.]/g, '');

              // Handle multiple decimal points
              const parts = cleanedValue.split('.');
              if (parts.length > 2) {
                const newValue = `${parts[0]}.${parts.slice(1).join('')}`;
                setValue(name, newValue, { shouldValidate: false });
                return;
              }

              if (value !== cleanedValue) {
                setValue(name, cleanedValue, { shouldValidate: false });
              }

              // Trigger validation
              trigger(name);
            },
          })}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground flex items-center pointer-events-none">
          {collateralSymbol} {collateralSymbol === 'sUSDS' && <SUsdsHelp />}
        </div>
      </div>
      {errors[name] && (
        <p className="text-destructive text-sm mt-1">
          {errors[name]?.message?.toString()}
        </p>
      )}
    </div>
  );
}
