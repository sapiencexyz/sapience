import { Input } from '@foil/ui/components/ui/input';
import { Label } from '@foil/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@foil/ui/components/ui/popover';
import { HelpCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import { z } from 'zod';

interface WagerInputProps {
  name?: string;
  collateralSymbol?: string;
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

export function WagerInput({
  name = 'wagerAmount',
  collateralSymbol = 'Tokens',
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

  // Determine helper text based on collateral symbol
  const helperText =
    collateralSymbol === 'sUSDS'
      ? 'sUSDS is the yield-bearing token of the Sky Protocol. Get sUSDS.'
      : undefined;

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
      <Label htmlFor={`${name}-input`}>Wager Amount</Label>
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
          {collateralSymbol}{' '}
          {helperText && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="ml-1 text-muted-foreground hover:text-foreground flex items-center justify-center cursor-pointer pointer-events-auto"
                  aria-label={`Information about ${collateralSymbol}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <HelpCircle size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" className="w-[200px] p-3 text-sm">
                <p>{helperText}</p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
      {errors[name] && (
        <p className="text-destructive text-sm">
          {errors[name]?.message?.toString()}
        </p>
      )}
    </div>
  );
}
