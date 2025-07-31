import { Button } from '@sapience/ui/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sapience/ui/components/ui/select';
import { useFormContext } from 'react-hook-form';

interface MultipleChoicePredictProps {
  name?: string;
  options: Array<{ name: string; marketId: number }>;
  variant?: 'buttons' | 'dropdown';
}

export default function MultipleChoicePredict({
  name = 'predictionValue',
  options,
  variant = 'buttons',
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

  if (variant === 'dropdown') {
    return (
      <div className="mt-2">
        <Select
          value={value}
          onValueChange={(newValue) => {
            setValue(name, newValue, { shouldValidate: true });
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent>
            {options.map(({ name: optionName, marketId }) => (
              <SelectItem key={marketId} value={marketId.toString()}>
                {optionName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Hidden input for form submission */}
        <input type="hidden" {...register(name)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
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
