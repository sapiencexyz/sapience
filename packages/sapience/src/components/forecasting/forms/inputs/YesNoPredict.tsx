import { Button } from '@foil/ui/components/ui/button';
import { Label } from '@foil/ui/components/ui/label';
import { useFormContext } from 'react-hook-form';

// Define constants for sqrtPriceX96 values
const YES_SQRT_PRICE_X96 = '79228162514264337593543950336'; // 2^96
const NO_SQRT_PRICE_X96 = '0';

interface YesNoPredictProps {
  name?: string;
}

export default function YesNoPredict({
  name = 'predictionValue',
}: YesNoPredictProps) {
  const { register, setValue, watch } = useFormContext();
  const value = watch(name);

  return (
    <div className="space-y-4">
      <div>
        <Label>Your Prediction</Label>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <Button
            type="button"
            onClick={() =>
              setValue(name, YES_SQRT_PRICE_X96, { shouldValidate: true })
            }
            className={`py-6 text-lg font-normal ${
              value === YES_SQRT_PRICE_X96
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Yes
          </Button>
          <Button
            type="button"
            onClick={() =>
              setValue(name, NO_SQRT_PRICE_X96, { shouldValidate: true })
            }
            className={`py-6 text-lg font-normal ${
              value === NO_SQRT_PRICE_X96
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            No
          </Button>
        </div>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    </div>
  );
}
