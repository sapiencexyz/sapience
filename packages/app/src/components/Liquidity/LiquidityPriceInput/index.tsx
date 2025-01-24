'use client';

import { useContext } from 'react';
import type { Control, Path, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';

import { FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { MarketContext } from '~/lib/context/MarketProvider';
import { removeLeadingZeros } from '~/lib/util/util';

interface Props<T extends FieldValues> {
  label: string;
  name: Path<T>;
  control: Control<T>;
  isDisabled?: boolean;
}

const LiquidityPriceInput = <T extends FieldValues>({
  label,
  name,
  control,
  isDisabled = false,
}: Props<T>) => {
  const { collateralAssetTicker, useMarketUnits } = useContext(MarketContext);

  const getCurrentUnit = () => {
    return useMarketUnits ? `Ggas/${collateralAssetTicker}` : 'gwei';
  };

  return (
    <div className="mb-4">
      <Controller
        name={name}
        control={control}
        render={({
          field: { onChange, value, onBlur },
          fieldState: { error },
        }) => (
          <FormItem>
            <FormLabel>{label}</FormLabel>
            <div className="relative flex">
              <Input
                value={value?.toString() || ''}
                onChange={(e) => onChange(removeLeadingZeros(e.target.value))}
                onBlur={() => {
                  if (value === '') {
                    onChange('0');
                  }
                  onBlur();
                }}
                type="number"
                inputMode="decimal"
                disabled={isDisabled}
                onWheel={(e) => e.currentTarget.blur()}
                className="pr-[120px]"
              />
              <div className="absolute inset-y-0 right-0 flex items-center px-3 border border-input bg-muted rounded-r-md">
                {getCurrentUnit()}
              </div>
            </div>
            {error && <FormMessage>{error.message}</FormMessage>}
          </FormItem>
        )}
      />
    </div>
  );
};

export default LiquidityPriceInput;
