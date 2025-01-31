'use client';

import { useContext } from 'react';
import type { Control, Path, FieldValues } from 'react-hook-form';
import { Controller } from 'react-hook-form';

import { useFoil } from '../../../lib/context/FoilProvider';
import { FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PeriodContext } from '~/lib/context/PeriodProvider';
import { removeLeadingZeros } from '~/lib/utils/util';

interface Props<T extends FieldValues> {
  label: string;
  name: Path<T>;
  control: Control<T>;
  isDisabled?: boolean;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
}

const getTickSpacingForFee = (fee: number): number => {
  if (fee === 100) {
    return 1;
  }
  if (fee === 500) {
    return 10;
  }
  if (fee === 3000) {
    return 60;
  }
  if (fee === 10000) {
    return 200;
  }
  return 0;
};

const LiquidityPriceInput = <T extends FieldValues>({
  label,
  name,
  control,
  isDisabled = false,
  onBlur: externalOnBlur,
}: Props<T>) => {
  const { stEthPerToken } = useFoil();
  const { collateralAssetTicker, useMarketUnits, marketParams } =
    useContext(PeriodContext);

  const getCurrentUnit = () => {
    return useMarketUnits ? `Ggas/${collateralAssetTicker}` : 'gwei';
  };

  // TODO: I don't think this is right
  const tickSpacing = getTickSpacingForFee(marketParams.feeRate);
  // Calculate the price ratio for one tick spacing
  const priceRatio = 1.0001 ** tickSpacing;
  // The step should be the minimum price change
  const step = useMarketUnits
    ? priceRatio - 1 // For market units, use the raw price ratio change
    : ((priceRatio - 1) * (stEthPerToken || 0)) / 1e9; // For gwei, convert the price ratio change

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
                onBlur={(e) => {
                  if (value === '') {
                    onChange('0');
                  }
                  onBlur();
                  if (externalOnBlur) {
                    externalOnBlur(e);
                  }
                }}
                type="number"
                inputMode="decimal"
                disabled={isDisabled}
                onWheel={(e) => e.currentTarget.blur()}
                className="pr-[120px]"
                step={step}
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
