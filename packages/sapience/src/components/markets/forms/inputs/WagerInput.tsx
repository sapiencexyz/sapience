import { Input } from '@sapience/sdk/ui/components/ui/input';
import { Label } from '@sapience/sdk/ui/components/ui/label';
import { useMemo, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { z } from 'zod';

import CollateralBalance from './CollateralBalance';
import { getChainShortName } from '~/lib/utils/util';

interface WagerInputProps {
  name?: string;
  collateralSymbol?: string;
  collateralAddress?: `0x${string}`;
  chainId?: number;
  // Optional minimum amount (human units) to enforce via validation
  minAmount?: string | number;
  // Optional maximum amount (human units) to enforce via validation
  maxAmount?: string | number;
  // Hide the label and the buttons to the right of the label
  hideHeader?: boolean;
  // Additional classes for the input element (e.g., height overrides)
  inputClassName?: string;
}

// Define the wager schema that will be used across all forms
export const wagerAmountSchema = z
  .string()
  .min(1, 'Wager amount is required')
  .refine(
    (val) => {
      const trimmed = val.trim();
      if (!trimmed) return false;
      const num = Number(trimmed);
      return !Number.isNaN(num) && Number.isFinite(num);
    },
    {
      message: 'Must be a valid number',
    }
  )
  .refine(
    (val) => {
      const num = Number(val.trim());
      return num > 0;
    },
    {
      message: 'Amount must be greater than 0',
    }
  );

/**
 * Creates a wager amount schema with optional min and max constraints
 * @param minAmount - Optional minimum amount (human units)
 * @param maxAmount - Optional maximum amount (human units)
 * @returns A Zod schema with min/max validation applied
 */
export const createWagerAmountSchema = (
  minAmount?: string | number,
  maxAmount?: string | number
): z.ZodTypeAny => {
  let schema: z.ZodTypeAny = wagerAmountSchema;
  if (minAmount !== undefined) {
    schema = schema.refine(
      (val: string) => {
        const num = Number(val.trim());
        return num >= Number(minAmount);
      },
      {
        message: `Amount must be at least ${minAmount}`,
      }
    );
  }

  if (maxAmount !== undefined) {
    schema = schema.refine(
      (val: string) => {
        const num = Number(val.trim());
        return num <= Number(maxAmount);
      },
      {
        message: `Amount must be less than or equal to ${maxAmount}`,
      }
    );
  }
  return schema;
};

export function WagerInput({
  name = 'wagerAmount',
  collateralSymbol,
  collateralAddress = '0x0000000000000000000000000000000000000000',
  chainId = 432,
  minAmount,
  maxAmount,
  hideHeader = false,
  inputClassName,
}: WagerInputProps) {
  const {
    register,
    formState: { errors },
    getValues,
    trigger,
    setValue,
  } = useFormContext();
  const chainShortName = getChainShortName(chainId);

  // Create schema with min/max constraints if provided
  // This is used for the validate function in register, but the form-level
  // schema (from zodResolver) is the source of truth for validation
  const validationSchema = useMemo(
    () => createWagerAmountSchema(minAmount, maxAmount),
    [minAmount, maxAmount]
  );

  // Use a ref to ensure the validate function always uses the latest schema
  const validationSchemaRef = useRef<z.ZodTypeAny>(validationSchema);
  validationSchemaRef.current = validationSchema;
  return (
    <div className="space-y-2">
      {!hideHeader && (
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
      )}
      <div className="relative">
        <Input
          id={`${name}-input`}
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoCapitalize="none"
          className={`pr-24 text-brand-white placeholder:text-brand-white/70 ${
            errors[name] ? 'border-destructive' : ''
          } ${inputClassName || ''}`}
          {...register(name, {
            // Validate function for immediate feedback
            // Note: Form-level validation (via zodResolver) is the source of truth
            // This provides additional validation for cases where zodResolver isn't used
            validate: (val) => {
              if (!val) return '';
              try {
                validationSchemaRef.current.parse(val);
                return true;
              } catch (error) {
                if (error instanceof z.ZodError) {
                  return error.errors[0]?.message ?? 'Invalid wager amount';
                }
                return 'Invalid wager amount';
              }
            },
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

              // Trigger validation (form-level schema will handle min/max)
              trigger(name);
            },
          })}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-white flex items-center pointer-events-none">
          {collateralSymbol}
        </div>
      </div>
      {typeof minAmount !== 'undefined' &&
        Number(getValues(name) || 0) < Number(minAmount) && (
          <p className="text-xs text-muted-foreground mt-1">
            Minimum: {minAmount} {collateralSymbol}
          </p>
        )}
      {typeof maxAmount !== 'undefined' &&
        Number(getValues(name) || 0) > Number(maxAmount) && (
          <p className="text-xs text-muted-foreground mt-1">
            Maximum: {maxAmount} {collateralSymbol}
          </p>
        )}
      {errors[name] &&
        (errors[name]?.message ? (
          <p className="text-destructive text-sm mb-2">
            {errors[name]?.message?.toString()}
          </p>
        ) : null)}
    </div>
  );
}
