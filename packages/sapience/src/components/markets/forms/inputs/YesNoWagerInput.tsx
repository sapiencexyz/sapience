import { Button } from '@sapience/ui/components/ui/button';
import { useFormContext } from 'react-hook-form';
import { useEffect } from 'react';

import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput } from './WagerInput';
import {
  YES_SQRT_PRICE_X96,
  NO_SQRT_PRICE_X96,
} from '~/lib/utils/betslipUtils';

interface YesNoWagerInputProps {
  marketGroupData: MarketGroupType;
  positionId: string; // Used to namespace form fields
  showWagerInput?: boolean; // Whether to show the per-position wager input
}

export default function YesNoWagerInput({
  marketGroupData,
  positionId,
  showWagerInput = true,
}: YesNoWagerInputProps) {
  const { register, setValue, watch, getValues } = useFormContext();

  const predictionFieldName = `positions.${positionId}.predictionValue`;
  const wagerAmountFieldName = `positions.${positionId}.wagerAmount`;

  const predictionValue = watch(predictionFieldName);

  // Ensure form reflects initial values when component mounts
  useEffect(() => {
    const currentValue = getValues(predictionFieldName);

    // If there's no current value, set the default to YES
    if (!currentValue) {
      setValue(predictionFieldName, YES_SQRT_PRICE_X96, {
        shouldValidate: true,
      });
    }
  }, [predictionFieldName, setValue, getValues, positionId]);

  return (
    <div className="space-y-2">
      <div>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <Button
            type="button"
            onClick={() =>
              setValue(predictionFieldName, YES_SQRT_PRICE_X96, {
                shouldValidate: true,
              })
            }
            className={`${
              predictionValue === YES_SQRT_PRICE_X96
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Yes
          </Button>
          <Button
            type="button"
            onClick={() =>
              setValue(predictionFieldName, NO_SQRT_PRICE_X96, {
                shouldValidate: true,
              })
            }
            className={`${
              predictionValue === NO_SQRT_PRICE_X96
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            No
          </Button>
        </div>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(predictionFieldName)} />
      </div>

      {showWagerInput && (
        <WagerInput
          name={wagerAmountFieldName}
          collateralSymbol={marketGroupData.collateralSymbol || 'testUSDe'}
          collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
          chainId={marketGroupData.chainId}
        />
      )}
    </div>
  );
}

// Constants are now exported from ~/lib/utils/betslipUtils for centralized management
