import { Button } from '@foil/ui/components/ui/button';
import { Label } from '@foil/ui/components/ui/label';
import { useFormContext } from 'react-hook-form';

interface MultipleChoicePredictProps {
  name?: string;
  options: Array<{ name: string; marketId: number }>;
}

export default function MultipleChoicePredict({
  name = 'predictionValue',
  options,
}: MultipleChoicePredictProps) {
  const { register, setValue, watch } = useFormContext();
  const value = watch(name);

  if (!options || options.length === 0) {
    return (
      <div className="text-muted-foreground py-4">
        No options available for this market.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Your Prediction</Label>
        <div className="grid grid-cols-1 gap-2 mt-2">
          {options.map(({ name: optionName, marketId }) => (
            <Button
              key={marketId}
              type="button"
              onClick={() => {
                setValue(name, marketId.toString(), { shouldValidate: true });
              }}
              className={`text-center justify-start font-normal ${
                value === marketId.toString()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {optionName}
            </Button>
          ))}
        </div>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    </div>
  );
}
