import { DEFAULT_CHAIN_ID } from '@sapience/sdk/constants';
import { Input } from '@sapience/ui/components/ui/input';
import { Label } from '@sapience/ui/components/ui/label';
import { useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { z } from 'zod';

import CollateralBalance from './CollateralBalance';
import { getChainShortName } from '~/lib/utils/util';

interface PositionSizeInputProps {
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

// Define the position size schema that will be used across all forms
export const positionSizeSchema = z
  .string()
  .min(1, 'Position size is required')
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
 * Creates a position size schema with optional min and max constraints
 * @param minAmount - Optional minimum amount (human units)
 * @param maxAmount - Optional maximum amount (human units)
 * @returns A Zod schema with min/max validation applied
 */
export const createPositionSizeSchema = (
  minAmount?: string | number,
  maxAmount?: string | number
): z.ZodTypeAny => {
  let schema: z.ZodTypeAny = positionSizeSchema;
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

export function PositionSizeInput({
  name = 'positionSize',
  collateralSymbol,
  collateralAddress = '0x0000000000000000000000000000000000000000',
  chainId = DEFAULT_CHAIN_ID,
  minAmount,
  maxAmount,
  hideHeader = false,
  inputClassName,
}: PositionSizeInputProps) {
  const {
    register,
    formState: { errors },
    setValue,
  } = useFormContext();
  const chainShortName = getChainShortName(chainId);

  // Create schema with min/max constraints if provided
  // Used by the validate function in register (form-level zodResolver is source of truth)
  const validationSchemaRef = useRef<z.ZodTypeAny>(
    createPositionSizeSchema(minAmount, maxAmount)
  );

  // Keep ref updated when constraints change
  useEffect(() => {
    validationSchemaRef.current = createPositionSizeSchema(
      minAmount,
      maxAmount
    );
  }, [minAmount, maxAmount]);
  return (
    <div className="space-y-2">
      {!hideHeader && (
        <div className="flex justify-between items-center">
          <Label htmlFor={`${name}-input`}>Position Size</Label>
          <CollateralBalance
            collateralSymbol={collateralSymbol}
            collateralAddress={collateralAddress}
            chainId={chainId}
            chainShortName={chainShortName}
            onSetPositionSize={(amount) =>
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
            errors[name] ? 'border-destructive ring-1 ring-destructive' : ''
          } ${inputClassName || ''}`}
          {...register(name, {
            // Validate function for immediate feedback
            // Note: Form-level validation (via zodResolver) is the source of truth
            // This provides additional validation for cases where zodResolver isn't used
            validate: (val) => {
              if (!val) return '';

              // Allow intermediate states like "." or ".5" while user is typing
              const trimmed = val.trim();
              if (
                trimmed === '.' ||
                trimmed === '-.' ||
                /^-?\.\d*$/.test(trimmed)
              ) {
                return true; // Allow partial decimal input
              }

              try {
                validationSchemaRef.current.parse(val);
                return true;
              } catch (error) {
                if (error instanceof z.ZodError) {
                  return error.errors[0]?.message ?? 'Invalid amount';
                }
                return 'Invalid amount';
              }
            },
            onChange: (e) => {
              // Allow only numbers and a single decimal point
              const { value } = e.target;
              const cleanedValue = value.replace(/[^0-9.]/g, '');

              // Handle multiple decimal points
              const parts = cleanedValue.split('.');
              let finalValue = cleanedValue;
              if (parts.length > 2) {
                // If multiple decimal points, keep only the first one
                finalValue = `${parts[0]}.${parts.slice(1).join('')}`;
              }

              // Update the input's value directly to keep it in sync
              if (e.target.value !== finalValue) {
                e.target.value = finalValue;
              }

              // Update the form state and validate immediately
              // This ensures form state is updated synchronously for useWatch to pick up changes
              // Note: Don't call clearErrors here - let validation set/clear errors naturally
              setValue(name, finalValue, {
                shouldValidate: true,
                shouldDirty: true,
                shouldTouch: true,
              });
            },
          })}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-white flex items-center pointer-events-none">
          {collateralSymbol}
        </div>
      </div>
    </div>
  );
}
