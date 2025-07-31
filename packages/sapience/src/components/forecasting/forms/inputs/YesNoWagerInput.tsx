import { Button } from '@sapience/ui/components/ui/button';
import { Label } from '@sapience/ui/components/ui/label';
import { useFormContext } from 'react-hook-form';

import type { MarketGroupType } from '@sapience/ui/types';
import { WagerInput } from './WagerInput';

interface YesNoWagerInputProps {
  marketGroupData: MarketGroupType;
  positionId: string; // Used to namespace form fields
}

// Define constants for sqrtPriceX96 values
const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96
const NO_SQRT_PRICE_X96 = '0';

export default function YesNoWagerInput({
  marketGroupData,
  positionId,
}: YesNoWagerInputProps) {
  const { register, setValue, watch } = useFormContext();

  const predictionFieldName = `positions.${positionId}.predictionValue`;
  const wagerAmountFieldName = `positions.${positionId}.wagerAmount`;

  const predictionValue = watch(predictionFieldName);

  return (
    <div className="space-y-4">
      <div>
        <Label>Your Prediction</Label>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <Button
            type="button"
            onClick={() =>
              setValue(predictionFieldName, YES_SQRT_PRICE_X96, {
                shouldValidate: true,
              })
            }
            className={`py-6 text-lg font-normal ${
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
            className={`py-6 text-lg font-normal ${
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

      <WagerInput
        name={wagerAmountFieldName}
        collateralSymbol={marketGroupData.collateralSymbol || 'tokens'}
        collateralAddress={marketGroupData.collateralAsset as `0x${string}`}
        chainId={marketGroupData.chainId}
      />
    </div>
  );
}

// Export constants for use by parent components
export { YES_SQRT_PRICE_X96, NO_SQRT_PRICE_X96 };
