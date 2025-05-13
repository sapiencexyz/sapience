import { Button } from '@foil/ui/components/ui/button';
import { Label } from '@foil/ui/components/ui/label';
import { useFormContext } from 'react-hook-form';

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
            onClick={() => setValue(name, '1', { shouldValidate: true })}
            className={`py-6 text-lg font-normal ${
              value === '1'
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            Yes
          </Button>
          <Button
            type="button"
            onClick={() => setValue(name, '0', { shouldValidate: true })}
            className={`py-6 text-lg font-normal ${
              value === '0'
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
